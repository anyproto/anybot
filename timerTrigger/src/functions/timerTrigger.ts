import { app } from "@azure/functions";
import GraphQL from "./graphql";

export async function timerTrigger(): Promise<void> {
  const org = "anyproto";
  const projectNumber = 4;

  const projectID = await GraphQL.getProjectId(org, projectNumber);
  const projectItems = await GraphQL.getProjectItems(projectID);
  const issueData: { issue: number; repo: string; status: string; linkedPRs: { number: number; repository: string }[] }[] = [];

  // get all issues in the project and store info in issueData
  for (const node of projectItems.node.items.nodes) {
    if (node.content && node.content.number) {
      const number = node.content.number;
      const repository = node.content.repository.name;
      const status = node.fieldValues.nodes.find((field: any) => field.field?.name === "Status")?.name;
      const linkedPRs: { number: number; repository: string }[] = [];
      const linkedPRsField = node.fieldValues.nodes.find((field: any) => field.field?.name === "Linked pull requests");

      // add linked pr number and repo to the issue
      if (linkedPRsField && linkedPRsField.pullRequests && linkedPRsField.pullRequests.nodes.length > 0) {
        linkedPRsField.pullRequests.nodes.forEach((pr: any) => {
          linkedPRs.push({
            number: pr.number,
            repository: pr.repository.name,
          });
        });
      }

      issueData.push({ issue: number, repo: repository, status: status, linkedPRs: linkedPRs });
    }
  }

  // check each issue's status and linked PRs
  for (const issue of issueData) {
    const issueNumber = issue.issue;
    const issueRepo = issue.repo;
    const linkedPRs = issue.linkedPRs;
    const issueItemStatus = issue.status;
    const issueItemID = await GraphQL.getIssueItemIdByProject(projectID, issueNumber);

    switch (issueItemStatus) {
      case "🏗 In progress":
        // For "🏗 In progress" issues, change status to "👀 In review" when PR is linked
        if (linkedPRs.length > 0) {
          for (const pr of linkedPRs) {
            const prItem = await GraphQL.getPullRequestItem(org, pr.repository, pr.number);
            if (!prItem.closed) {
              GraphQL.changeItemStatus(projectID, issueItemID, "👀 In review");
              GraphQL.removeLabel(org, issueRepo, issueNumber, "in-progress");
              GraphQL.addLabel(org, issueRepo, issueNumber, "in-progress");
            } else if (prItem.merged) {
              throw new Error("PR is merged but issue status is still '🏗 In progress'");
            }
          }
        }
        break;

      case "👀 In review":
        // For "👀 In review" issues, change status to "🏗 In progress" when PR is unlinked
        if (linkedPRs.length == 0) {
          GraphQL.changeItemStatus(projectID, issueItemID, "🏗 In progress");
          GraphQL.removeLabel(org, issueRepo, issueNumber, "in-review");
          GraphQL.addLabel(org, issueRepo, issueNumber, "in-progress");
        }

        // For "👀 In review" issues, change status to "✅ Done" when PR is merged
        // For "👀 In review" issues, change status to "🏗 In progress" when PR is closed without merging
        if (linkedPRs.length > 0) {
          let openPRexists = false;
          let mergedPRexists = false;
          let closedPRexists = false;

          for (const pr of linkedPRs) {
            const prItem = await GraphQL.getPullRequestItem(org, pr.repository, pr.number);
            if (!prItem.closed) {
              openPRexists = true;
            } else if (prItem.merged) {
              mergedPRexists = true;
            } else if (prItem.closed) {
              closedPRexists = true;
            }
          }

          if (!openPRexists) {
            if (mergedPRexists) {
              GraphQL.changeItemStatus(projectID, issueItemID, "✅ Done");
              GraphQL.removeLabel(org, issueRepo, issueNumber, "in-review");
            } else if (!mergedPRexists && closedPRexists) {
              GraphQL.changeItemStatus(projectID, issueItemID, "🏗 In progress");
              GraphQL.removeLabel(org, issueRepo, issueNumber, "in-review");
              GraphQL.addLabel(org, issueRepo, issueNumber, "in-progress");
            }
          }
        }
        break;
    }
  }
}

app.timer("timerTrigger", {
  schedule: "0/30 * * * * *",
  handler: timerTrigger,
});

import { app } from "@azure/functions";
import GitHubGraphQL from "./graphqlUtils";
import LinearSync from "./linearSynchronizer";

export async function timerTrigger(): Promise<void> {
  const org = "anyproto";
  const projectNumber = 4;
  const issueData: {
    number: number;
    title: string;
    repo: string;
    status: string;
    linkedPRs: {
      number: number;
      repository: string;
    }[];
  }[] = [];

  const projectId = await GitHubGraphQL.getProjectId(org, projectNumber);
  const projectItems = await GitHubGraphQL.getProjectItems(projectId);

  // get all issues in the project and store info in issueData
  for (const node of projectItems.node.items.nodes) {
    if (node.content && node.content.number) {
      const issueNumber = node.content.number;
      const issueTitle = node.content.title;
      const issueRepository = node.content.repository.name;
      const issueStatus = node.fieldValues.nodes.find((field: any) => field.field?.name === "Status")?.name;

      // add linked pr number and repo to the issue
      const linkedPRs: { number: number; repository: string }[] = [];
      const linkedPRsField = node.fieldValues.nodes.find((field: any) => field.field?.name === "Linked pull requests");

      if (linkedPRsField && linkedPRsField.pullRequests && linkedPRsField.pullRequests.nodes.length > 0) {
        linkedPRsField.pullRequests.nodes.forEach((pr: any) => {
          // collect all publicly linked PRs
          if (pr != null) {
            linkedPRs.push({ number: pr.number, repository: pr.repository.name });
          }
        });
      }

      issueData.push({ number: issueNumber, title: issueTitle, repo: issueRepository, status: issueStatus, linkedPRs: linkedPRs });
    }
  }

  // check each issue's status and linked PRs
  for (const issue of issueData) {
    const issueNumber = issue.number;
    const issueRepository = issue.repo;
    const linkedPRs = issue.linkedPRs;
    const issueItemStatus = issue.status;
    const issueItemId = await GitHubGraphQL.getIssueItemIdByProject(projectId, issueNumber);

    switch (issueItemStatus) {
      case "🏗 In progress":
        // For "🏗 In progress" issues, change status to "👀 In review" when PR is linked
        if (linkedPRs.length > 0) {
          for (const pr of linkedPRs) {
            const prItem = await GitHubGraphQL.getPullRequestItem(org, pr.repository, pr.number);
            if (!prItem.closed) {
              const statusOptionId = await GitHubGraphQL.getStatusOptionId(projectId, "👀 In review");
              GitHubGraphQL.changeProjectField(projectId, issueItemId, "Status", statusOptionId);
              GitHubGraphQL.removeLabel(org, issueRepository, issueNumber, "in-progress");
              LinearSync.changeStatus(issue, "inReview");
              LinearSync.postComment(issue, "[Bot] Issue is ready for review: " + prItem.url);
            } else if (prItem.merged) {
              throw new Error("PR is merged but issue status is still '🏗 In progress'");
            }
          }
        }
        break;

      case "👀 In review":
        // For "👀 In review" issues, change status to "🏗 In progress" when PR is unlinked
        if (linkedPRs.length == 0) {
          const statusOptionId = await GitHubGraphQL.getStatusOptionId(projectId, "🏗 In progress");
          GitHubGraphQL.changeProjectField(projectId, issueItemId, "Status", statusOptionId);
          GitHubGraphQL.addLabel(org, issueRepository, issueNumber, "in-progress");
          LinearSync.changeStatus(issue, "inProgress");
        }

        // For "👀 In review" issues, change status to "✅ Done" when PR is merged
        // For "👀 In review" issues, change status to "🏗 In progress" when PR is closed without merging
        if (linkedPRs.length > 0) {
          let openPRexists = false;
          let mergedPRexists = false;
          let closedPRexists = false;

          for (const pr of linkedPRs) {
            const prItem = await GitHubGraphQL.getPullRequestItem(org, pr.repository, pr.number);
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
              const statusOptionId = await GitHubGraphQL.getStatusOptionId(projectId, "✅ Done");
              GitHubGraphQL.changeProjectField(projectId, issueItemId, "Status", statusOptionId);
              LinearSync.changeStatus(issue, "done");
            } else if (!mergedPRexists && closedPRexists) {
              const statusOptionId = await GitHubGraphQL.getStatusOptionId(projectId, "🏗 In progress");
              GitHubGraphQL.changeProjectField(projectId, issueItemId, "Status", statusOptionId);
              GitHubGraphQL.addLabel(org, issueRepository, issueNumber, "in-progress");
              LinearSync.changeStatus(issue, "inProgress");
            }
          }
        }
        break;
    }
  }
}

app.timer("timerTrigger", {
  schedule: "0 */2 * * * *",
  handler: timerTrigger,
});

import { Probot } from "probot";
import GraphQL from "./graphql";

export = (app: Probot) => {
  // PROJECT MANAGEMENT
  const targetRepo = "bot-test";
  const org = "anyproto";
  const projectNumber = 4;

  // For "🆕 New" issues, change status to "🏗 In progress", assigne @any-association to the issue, save comment’s author name to "Lead contributor"
  // command format: @any assign me
  // For "🏗 In progress" issues, change status to "New", remove assignee, remove the content of "Lead contributor"
  // command format: @any unassign me
  app.on("issue_comment", async (context) => {
    const repository = context.payload.repository.name;

    if (repository == targetRepo) {
      const comment = context.payload.comment.body.trim();
      const user = context.payload.comment.user.login;
      const issue = context.payload.issue;
      const issueNumber = context.payload.issue.number;
      const words = comment.split(" ");

      if ((words[0] == "@any" || words[0] == "@anybot" || words[0] == "@any-bot") && words[2] == "me" && issue.state == "open") {
        const projectId = await GraphQL.getProjectId(org, projectNumber);
        const leadContributorFieldId = await GraphQL.getLeadContributorFieldId(projectId);
        const issueItemId = await GraphQL.getIssueItemIdByProject(projectId, issueNumber);
        const issueItemStatus = await GraphQL.getIssueItemStatus(projectId, issueNumber);

        switch (words[1]) {
          case "assign":
            if (issueItemStatus == "🆕 New") {
              // Change status to "🏗 In progress"
              GraphQL.changeItemStatus(projectId, issueItemId, "🏗 In progress");

              // Add "in-progress" label
              await context.octokit.issues.addLabels({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                labels: ["in-progress"],
              });

              // Add assignee
              await context.octokit.issues.addAssignees({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                assignees: ["any-association"],
              });

              // Save the comment's author name to "Lead contributor"
              GraphQL.addLeadContributor(projectId, issueItemId, leadContributorFieldId, user);
            } else {
              throw new Error('Issue is not in "🆕 New" status. Can\'t assign new contributor.');
            }
            break;

          case "unassign":
            if (issueItemStatus == "🏗 In progress") {
              // Change status to "🆕 New"
              GraphQL.changeItemStatus(projectId, issueItemId, "🆕 New");

              // Remove "in-progress" label
              await context.octokit.issues.removeLabel({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                name: "in-progress",
              });

              // Add "new" label
              await context.octokit.issues.addLabels({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                labels: ["new"],
              });

              // Remove assignee
              await context.octokit.issues.removeAssignees({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                assignees: ["any-association"],
              });

              // Remove the content of "Lead contributor"
              GraphQL.removeLeadContributor(projectId, issueItemId, leadContributorFieldId);
            } else {
              throw new Error('Issue is not in "🏗 In progress" status. Can\'t unassign contributor.');
            }
            break;

          default:
            throw new Error('Invalid command: "' + words[1] + '"');
        }
      }
    }
  });

  // Timer, works only for "In progress" issues
  // On the 6th day of inactivity in the issue, post a comment with the message "@{lead-contributor}, please confirm that you’re still working on this by commenting this issue"
  // On the 7th day of inactivity in the issues, post a comment with the message "@{lead-contributor}, the issue is now available for other contributors due to inactivity", change status to "New", remove assignee, remove content of "Lead contributor"
  app.on("issues.labeled", async (context) => {
    const repository = context.payload.repository.name;

    if (repository == targetRepo) {
      const label = context.payload.label?.name;
      const issueNumber = context.payload.issue.number;
      const projectId = await GraphQL.getProjectId(org, projectNumber);
      const issueItemStatus = await GraphQL.getIssueItemStatus(projectId, issueNumber);
      const LeadContributor = await GraphQL.getLeadContributor(projectId, issueNumber);

      if (issueItemStatus == "🏗 In progress") {
        switch (label) {
          case "stale":
            // Post a comment with the message "@{lead-contributor}, please confirm that you’re still working on this by commenting this issue
            await context.octokit.issues.createComment({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              body: "@" + LeadContributor + ", please confirm that you're still working on this by commenting this issue.",
            });
            break;
          case "inactive":
            // Post a comment with the message "@{lead-contributor}, the issue is now available for other contributors due to inactivity"
            await context.octokit.issues.createComment({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              body: "@" + LeadContributor + ", the issue is now available for other contributors due to inactivity.",
            });

            // Change status to "🆕 New"
            const issueItemId = await GraphQL.getIssueItemIdByProject(projectId, issueNumber);
            GraphQL.changeItemStatus(projectId, issueItemId, "🆕 New");

            // Remove assignee
            await context.octokit.issues.removeAssignees({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              assignees: ["any-association"],
            });

            // Remove content of "Lead contributor"
            const leadContributorFieldId = await GraphQL.getLeadContributorFieldId(projectId);
            GraphQL.removeLeadContributor(projectId, issueItemId, leadContributorFieldId);

            // Remove label "inactive"
            await context.octokit.issues.removeLabel({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              name: "inactive",
            });

            // Remove label "stale"
            await context.octokit.issues.removeLabel({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              name: "stale",
            });

            // temporary: remove "in-progress" label
            await context.octokit.issues.removeLabel({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              name: "in-progress",
            });
        }
      } else {
        if (label == "stale" || label == "inactive") {
          throw new Error('Label "' + label + '" added, but issue #' + issueNumber + ' is not in "🏗 In progress" status.');
        }
      }

      // Add issue from Linear to project with status "🆕 New"
      if (label == "linear") {
        const issueItemId = await GraphQL.addIssueToProject(projectId, org, repository, issueNumber);
        await GraphQL.changeItemStatus(projectId, issueItemId, "🆕 New");
      }
    }
  });
};

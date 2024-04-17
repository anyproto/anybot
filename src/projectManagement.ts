import { Probot } from "probot";
import { LinearClient, LinearFetch, User } from "@linear/sdk";
import GitHubGraphQL from "./graphql";

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
        const projectId = await GitHubGraphQL.getProjectId(org, projectNumber);
        const issueItemId = await GitHubGraphQL.getIssueItemIdByProject(projectId, issueNumber);
        const issueItemStatus = await GitHubGraphQL.getIssueItemStatus(projectId, issueNumber);

        switch (words[1]) {
          case "assign":
            if (issueItemStatus == "🆕 New") {
              // Change status to "🏗 In progress"
              GitHubGraphQL.changeItemStatus(projectId, issueItemId, "🏗 In progress");

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
                assignees: [user],
              });
            } else {
              throw new Error('Issue is not in "🆕 New" status. Can\'t assign new contributor.');
            }
            break;

          case "unassign":
            if (issueItemStatus == "🏗 In progress") {
              // Change status to "🆕 New"
              GitHubGraphQL.changeItemStatus(projectId, issueItemId, "🆕 New");

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
                assignees: [user],
              });
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
      const assignee = context.payload.issue.assignee?.login;
      const projectId = await GitHubGraphQL.getProjectId(org, projectNumber);
      const issueItemStatus = await GitHubGraphQL.getIssueItemStatus(projectId, issueNumber);

      if (issueItemStatus == "🏗 In progress") {
        switch (label) {
          case "stale":
            // Post a comment with the message "@{lead-contributor}, please confirm that you’re still working on this by commenting this issue
            await context.octokit.issues.createComment({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              body: "@" + assignee + ", please confirm that you're still working on this by commenting this issue.",
            });
            break;
          case "inactive":
            // Post a comment with the message "@{lead-contributor}, the issue is now available for other contributors due to inactivity"
            await context.octokit.issues.createComment({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              body: "@" + assignee + ", the issue is now available for other contributors due to inactivity.",
            });

            // Change status to "🆕 New"
            const issueItemId = await GitHubGraphQL.getIssueItemIdByProject(projectId, issueNumber);
            GitHubGraphQL.changeItemStatus(projectId, issueItemId, "🆕 New");

            // Remove assignee
            await context.octokit.issues.removeAssignees({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              assignees: ["any-association"],
            });

            // Remove assignee
            if (assignee) {
              await context.octokit.issues.removeAssignees({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                assignees: [assignee],
              });
            }

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

            // Remove "in-progress" label
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
        const issueItemId = await GitHubGraphQL.addIssueToProject(projectId, org, repository, issueNumber);
        await GitHubGraphQL.changeItemStatus(projectId, issueItemId, "🆕 New");
      }
    }
  });
};

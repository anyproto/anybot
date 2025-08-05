import { Probot } from "probot";
import GitHubGraphQL from "./graphql.js";
import LinearSync from "./linearSynchronizer.js";

export default (app: Probot) => {
  // PROJECT MANAGEMENT
  const targetRepo = process.env.STAND == "prod" ? "contributors" : "bot-test";
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
      const user = context.payload.comment.user?.login;
      const issue = context.payload.issue;
      const issueNumber = context.payload.issue.number;
      const words = comment.split(" ");

      // Handle @any assign me and @any assign @username commands
      if ((words[0] == "@any" || words[0] == "@anybot" || words[0] == "@any-bot") && words[1] == "assign" && issue.state == "open") {
        const projectId = await GitHubGraphQL.getProjectId(org, projectNumber);
        const issueItemId = await GitHubGraphQL.getIssueItemIdByProject(projectId, issueNumber);
        const issueItemStatus = await GitHubGraphQL.getIssueItemStatus(projectId, issueNumber);

        if (issueItemStatus == "🆕 New") {
          // Change status to "🏗 In progress"
          const statusOptionId = await GitHubGraphQL.getStatusOptionId(projectId, "🏗 In progress");
          if (!statusOptionId) {
            throw new Error('Status option "🏗 In progress" not found');
          }
          GitHubGraphQL.changeProjectField(projectId, issueItemId, "Status", statusOptionId);
          LinearSync.changeStatus(issue, "inProgress");

          // Add "in-progress" label
          await context.octokit.rest.issues.addLabels({
            owner: org,
            repo: repository,
            issue_number: issueNumber,
            labels: ["in-progress"],
          });

          let assignee: string;
          if (words[2] == "me") {
            assignee = user || "";
          } else if (words[2]) {
            assignee = words[2].startsWith("@") ? words[2].substring(1) : words[2];
          } else {
            throw new Error('Invalid assign command. Use "@any assign me" or "@any assign @username"');
          }

          // Add assignee
          if (assignee) {
            await context.octokit.rest.issues.addAssignees({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              assignees: [assignee],
            });
          }
        } else {
          throw new Error('Issue is not in "🆕 New" status. Can\'t assign new contributor.');
        }
      }

      // Handle @any unassign me command
      if (
        (words[0] == "@any" || words[0] == "@anybot" || words[0] == "@any-bot") &&
        words[1] == "unassign" &&
        words[2] == "me" &&
        issue.state == "open"
      ) {
        const projectId = await GitHubGraphQL.getProjectId(org, projectNumber);
        const issueItemId = await GitHubGraphQL.getIssueItemIdByProject(projectId, issueNumber);
        const issueItemStatus = await GitHubGraphQL.getIssueItemStatus(projectId, issueNumber);

        if (issueItemStatus == "🏗 In progress") {
          // Change status to "🆕 New"
          const statusOptionId = await GitHubGraphQL.getStatusOptionId(projectId, "🆕 New");
          if (!statusOptionId) {
            throw new Error('Status option "🆕 New" not found');
          }
          GitHubGraphQL.changeProjectField(projectId, issueItemId, "Status", statusOptionId);
          LinearSync.changeStatus(issue, "readyForDev");

          // Remove "in-progress" label
          await context.octokit.rest.issues.removeLabel({
            owner: org,
            repo: repository,
            issue_number: issueNumber,
            name: "in-progress",
          });

          // Remove assignee
          await context.octokit.rest.issues.removeAssignees({
            owner: org,
            repo: repository,
            issue_number: issueNumber,
            assignees: user ? [user] : [],
          });
        } else {
          throw new Error('Issue is not in "🏗 In progress" status. Can\'t unassign contributor.');
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
      const issue = context.payload.issue;
      const label = context.payload.label?.name;
      const issueNumber = context.payload.issue.number;
      const assignee = context.payload.issue.assignee?.login;
      const projectId = await GitHubGraphQL.getProjectId(org, projectNumber);
      const issueItemStatus = await GitHubGraphQL.getIssueItemStatus(projectId, issueNumber);

      if (issueItemStatus == "🏗 In progress") {
        switch (label) {
          case "stale":
            // Post a comment with the message "@{lead-contributor}, please confirm that you’re still working on this by commenting this issue
            await context.octokit.rest.issues.createComment({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              body: "@" + assignee + ", please confirm that you're still working on this by commenting this issue.",
            });
            break;
          case "inactive":
            // Post a comment with the message "@{lead-contributor}, the issue is now available for other contributors due to inactivity"
            await context.octokit.rest.issues.createComment({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              body: "@" + assignee + ", the issue is now available for other contributors due to inactivity.",
            });

            // Change status to "🆕 New"
            const issueItemId = await GitHubGraphQL.getIssueItemIdByProject(projectId, issueNumber);
            if (!issueItemId) {
              throw new Error(`Issue #${issueNumber} not found in project`);
            }
            const statusOptionId = await GitHubGraphQL.getStatusOptionId(projectId, "🆕 New");
            if (!statusOptionId) {
              throw new Error('Status option "🆕 New" not found');
            }
            GitHubGraphQL.changeProjectField(projectId, issueItemId, "Status", statusOptionId);
            LinearSync.changeStatus(issue, "readyForDev");

            // Remove assignee
            if (assignee) {
              await context.octokit.rest.issues.removeAssignees({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                assignees: [assignee],
              });
            }

            // Remove label "inactive"
            await context.octokit.rest.issues.removeLabel({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              name: "inactive",
            });

            // Remove label "stale"
            await context.octokit.rest.issues.removeLabel({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              name: "stale",
            });

            // Remove "in-progress" label
            await context.octokit.rest.issues.removeLabel({
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
        if (!issueItemId) {
          throw new Error(`Failed to add issue #${issueNumber} to project`);
        }
        const statusOptionId = await GitHubGraphQL.getStatusOptionId(projectId, "🆕 New");
        if (!statusOptionId) {
          throw new Error('Status option "🆕 New" not found');
        }
        await GitHubGraphQL.changeProjectField(projectId, issueItemId, "Status", statusOptionId);

        await context.octokit.rest.issues.removeLabel({
          owner: org,
          repo: repository,
          issue_number: issueNumber,
          name: "linear",
        });

        // Sync status, priority, and size field with Linear
        LinearSync.changeStatus(issue, "readyForDev");
        LinearSync.syncProjectField(projectId, issue, issueItemId, "Priority");
        LinearSync.syncProjectField(projectId, issue, issueItemId, "Size");
      }
    }
  });
};

import { Probot } from "probot";
import GraphQL from "./graphql";

export = (app: Probot) => {
  // PROJECT MANAGEMENT
  const targetRepo = "contributors";
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
        const projectID = await GraphQL.getProjectID(org, projectNumber);
        const leadContributorFieldID = await GraphQL.getLeadContributorFieldID(projectID);
        const issueItemID = await GraphQL.getIssueItemID(projectID, issueNumber);
        const issueItemStatus = await GraphQL.getIssueItemStatus(projectID, issueNumber);

        switch (words[1]) {
          case "assign":
            if (issueItemStatus == "🆕 New") {
              // Change status to "🏗 In progress"
              GraphQL.changeItemStatus(projectID, issueItemID, "🏗 In progress");

              // temporary: add "in-progress" label
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
              GraphQL.addLeadContributor(projectID, issueItemID, leadContributorFieldID, user);
            } else {
              throw new Error('Issue is not in "🆕 New" status. Can\'t assign new contributor.');
            }
            break;

          case "unassign":
            if (issueItemStatus == "🏗 In progress") {
              // Change status to "🆕 New"
              GraphQL.changeItemStatus(projectID, issueItemID, "🆕 New");

              // temporary: remove "in-progress" label
              await context.octokit.issues.removeLabel({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                name: "in-progress",
              });

              // Remove assignee
              await context.octokit.issues.removeAssignees({
                owner: org,
                repo: repository,
                issue_number: issueNumber,
                assignees: ["any-association"],
              });

              // Remove the content of "Lead contributor"
              GraphQL.removeLeadContributor(projectID, issueItemID, leadContributorFieldID);
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
      const projectID = await GraphQL.getProjectID(org, projectNumber);
      const issueItemStatus = await GraphQL.getIssueItemStatus(projectID, issueNumber);
      const LeadContributor = await GraphQL.getLeadContributor(projectID, issueNumber);

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
            const issueItemID = await GraphQL.getIssueItemID(projectID, issueNumber);
            GraphQL.changeItemStatus(projectID, issueItemID, "🆕 New");

            // Remove assignee
            await context.octokit.issues.removeAssignees({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              assignees: ["any-association"],
            });

            // Remove content of "Lead contributor"
            const leadContributorFieldID = await GraphQL.getLeadContributorFieldID(projectID);
            GraphQL.removeLeadContributor(projectID, issueItemID, leadContributorFieldID);

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
    }
  });
};

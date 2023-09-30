import { Probot } from "probot";
//! merge files
import linksToIssue from "./util";
import GraphQL from "./graphql";

export = (app: Probot) => {
  // PROJECT MANAGEMENT
  const targetRepo = "contributors";
  const org = "anyproto"
  const projectNumber = 4;

  // For "🆕 New" issues, change status to “🏗 In progress”, assigne @any-association to the issue, save comment’s author name to “Lead contributor”
  // command format: @any assign me
  // For “🏗 In progress” issues, change status to “New”, remove assignee, remove the content of “Lead contributor"
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

  // Timer, works only for “In progress” issues
  // On the 6th day of inactivity in the issue, post a comment with the message “@{lead-contributor}, please confirm that you’re still working on this by commenting this issue”
  // On the 7th day of inactivity in the issues, post a comment with the message “@{lead-contributor}, the issue is now available for other contributors due to inactivity”, change status to “New”, remove assignee, remove content of “Lead contributor”
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
            // Post a comment with the message “@{lead-contributor}, please confirm that you’re still working on this by commenting this issue
            await context.octokit.issues.createComment({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              body: "@" + LeadContributor + ", please confirm that you're still working on this by commenting this issue.",
            });
            break;
          case "inactive":
            // Post a comment with the message “@{lead-contributor}, the issue is now available for other contributors due to inactivity”
            await context.octokit.issues.createComment({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              body: "@" + LeadContributor + ", the issue is now available for other contributors due to inactivity.",
            });

            // Change status to “🆕 New”
            const issueItemID = await GraphQL.getIssueItemID(projectID, issueNumber);
            GraphQL.changeItemStatus(projectID, issueItemID, "🆕 New");

            // Remove assignee
            await context.octokit.issues.removeAssignees({
              owner: org,
              repo: repository,
              issue_number: issueNumber,
              assignees: ["any-association"],
            });

            // Remove content of “Lead contributor”
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

  // For "🏗 In progress" issues, change status to “👀 In review” when PR is linked
  app.on(["pull_request.opened"], async (context) => {
    const comment = context.payload.pull_request.body?.trim();
    const pullRequestNumber = context.payload.pull_request.number;
    const pullRequestRepo = context.payload.pull_request.head.repo.name;

    if (linksToIssue(comment)) {
      const projectID = await GraphQL.getProjectID(org, projectNumber);
      const issueNumber = await GraphQL.getLinkedIssueNumber(projectID, pullRequestNumber, pullRequestRepo);

      const issueItemID = await GraphQL.getIssueItemID(projectID, issueNumber);
      const issueItemStatus = await GraphQL.getIssueItemStatus(projectID, issueNumber);

      if (issueItemStatus != "🏗 In progress") {
        throw new Error("Issue is not in 🏗 In progress status. Can't change status to 👀 In review.");
      } else {
        // Change status to "👀 In review"
        GraphQL.changeItemStatus(projectID, issueItemID, "👀 In review");
      }
    } else {
      throw new Error("PR is not linked to an issue.");
    }
  });

  // For "🏗 In progress" issues, change status to “👀 In review” when PR is linked
  // For “👀 In review” issues, change status to “🏗 In progress” when PR is unlinked
  app.on("pull_request.edited", async (context) => {
    const comment = context.payload.pull_request.body?.trim();
    const previousComment = context.payload.changes?.body?.from.trim();
    const pullRequestNumber = context.payload.pull_request.number;
    const pullRequestRepo = context.payload.pull_request.head.repo.name;

    const projectID = await GraphQL.getProjectID(org, projectNumber);

    if (linksToIssue(comment) && !linksToIssue(previousComment)) {
      // PR linked to issue
      const issueNumber = await GraphQL.getLinkedIssueNumber(projectID, pullRequestNumber, pullRequestRepo);
      const issueItemID = await GraphQL.getIssueItemID(projectID, issueNumber);
      const issueItemStatus = await GraphQL.getIssueItemStatus(projectID, issueNumber);

      if (issueItemStatus != "🏗 In progress") {
        throw new Error('Issue is not in "🏗 In progress" status. Can\'t change status to "👀 In review".');
      } else {
        // Change status to "👀 In review"
        GraphQL.changeItemStatus(projectID, issueItemID, "👀 In review");
      }
    } else if (!linksToIssue(comment) && linksToIssue(previousComment)) {
      // PR unlinked from issue
      // TODO: refactor to better handle issue linked in previous comment
      if (previousComment) {
        const issueNumber = parseInt(previousComment?.split("#")[1].split(" ")[0]);
        const issueItemID = await GraphQL.getIssueItemID(projectID, issueNumber);
        const issueItemStatus = await GraphQL.getIssueItemStatus(projectID, issueNumber);

        if (issueItemStatus != "👀 In review") {
          throw new Error("Issue is not in 👀 In review status. Can't change status to 🏗 In progress.");
        } else {
          // Change status to "🏗 In progress"
          GraphQL.changeItemStatus(projectID, issueItemID, "🏗 In progress");
        }
      } else {
        throw new Error('Previous comment is undefined. Issue remains in "👀 In review" status.');
      }
    } else if (linksToIssue(comment) && linksToIssue(previousComment)) {
      // PR potetially linked to another issue
      if (previousComment) {
        const issueNumber = await GraphQL.getLinkedIssueNumber(projectID, pullRequestNumber, pullRequestRepo);
        const previousIssueNumber = parseInt(previousComment?.split("#")[1].split(" ")[0]);

        if (issueNumber == previousIssueNumber) {
          // PR still linked to the same issue
          console.log("PR still linked to the same issue. Nothing to do.");
        } else {
          // PR linked to another issue
          // Change status of new linked issue to "👀 In review"
          const issueItemID = await GraphQL.getIssueItemID(projectID, issueNumber);
          const issueItemStatus = await GraphQL.getIssueItemStatus(projectID, issueNumber);

          if (issueItemStatus != "🏗 In progress") {
            throw new Error('Issue is not in "🏗 In progress" status. Can\'t change status to "👀 In review".');
          } else {
            GraphQL.changeItemStatus(projectID, issueItemID, "👀 In review");
          }

          // Change status of previous linked issue to "🏗 In progress"
          const previousIssueItemID = await GraphQL.getIssueItemID(projectID, previousIssueNumber);
          const previousIssueItemStatus = await GraphQL.getIssueItemStatus(projectID, previousIssueNumber);

          if (previousIssueItemStatus != "👀 In review") {
            throw new Error("Previous issue is not in 👀 In review status. Can't change status to 🏗 In progress.");
          } else {
            GraphQL.changeItemStatus(projectID, previousIssueItemID, "🏗 In progress");
          }
        }
      } else {
        throw new Error("Previous comment is undefined. Issue remains in 👀 In review status.");
      }
    } else {
      throw new Error("PR is not linked to an issue.");
    }
  });

  // For “👀 In review” issues, change status to “🏗 In progress” when PR is closed without merging
  // For “👀 In review” issues, change status to “Done” when PR is merged
  app.on("pull_request.closed", async (context) => {
    const comment = context.payload.pull_request.body?.trim();
    const pullRequestNumber = context.payload.pull_request.number;
    const pullRequestRepo = context.payload.pull_request.head.repo.name;

    if (linksToIssue(comment)) {
      const projectID = await GraphQL.getProjectID(org, projectNumber);
      const issueNumber = await GraphQL.getLinkedIssueNumber(projectID, pullRequestNumber, pullRequestRepo);
      const wasMerged = context.payload.pull_request.merged;

      const issueItemID = await GraphQL.getIssueItemID(projectID, issueNumber);
      const issueItemStatus = await GraphQL.getIssueItemStatus(projectID, issueNumber);

      if (issueItemStatus == "👀 In review" && wasMerged) {
        // Change status to "✅ Done" if PR was merged
        GraphQL.changeItemStatus(projectID, issueItemID, "✅ Done");
      } else if (issueItemStatus == "👀 In review" && !wasMerged) {
        // Change status to "🏗 In progress" if PR was closed without merging
        GraphQL.changeItemStatus(projectID, issueItemID, "🏗 In progress");
      } else if (issueItemStatus == "✅ Done" && wasMerged) {
        console.log('Default GitHub Workflow already changed status to "✅ Done". Nothing to do.');
      } else {
        throw new Error("Issue is in incorrect status. Can't change status.");
      }
    } else {
      throw new Error("PR is not linked to an issue.");
    }
  });
};

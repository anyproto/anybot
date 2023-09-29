import { Probot } from "probot";
import renderContributors from "./render_contributors";
import linksToIssue from "./util";
import GraphQL from "./graphql";

export = (app: Probot) => {
  // CONTRIBUTORS MANAGEMENT
  const targetRepo = "contributors";
  const targetFile = "contributors.json";
  const targetBranch = "main";
  const org = "anyproto";

  // PROJECT MANAGEMENT
  const projectNumber = 4;

  // Add contributor based on @any or @anybot mentioning in comment
  // command format: @any contributor <github_name> <type> <additional info>
  app.on(["discussion_comment", "issue_comment", "pull_request_review_comment"], async (context) => {
    const comment = context.payload.comment.body;
    const repo = context.payload.repository.full_name;
    let number;
    switch (context.name) {
      case "discussion_comment":
        number = context.payload.discussion.number;
        break;
      case "issue_comment":
        number = context.payload.issue.number;
        break;
      case "pull_request_review_comment":
        number = context.payload.pull_request.number;
        break;
    }

    const url = context.payload.comment.html_url;
    const words = comment.split(" ");

    if (
      words.length >= 3 &&
      (words[0] == "@any" || words[0] == "@anybot" || words[0] == "@any-bot") &&
      words[1] == "contributor" &&
      words[2].startsWith("@")
    ) {
      // create new-contributors branch if it doesn't exist
      try {
        await context.octokit.repos.getBranch({
          owner: org,
          repo: targetRepo,
          branch: "new-contributors",
        });
      } catch (error) {
        const mainBranch = await context.octokit.repos.getBranch({
          owner: org,
          repo: targetRepo,
          branch: targetBranch,
        });
        await context.octokit.rest.git.createRef({
          owner: org,
          repo: targetRepo,
          ref: "refs/heads/new-contributors",
          sha: mainBranch.data.commit.sha,
        });
      }

      // get or create contributions.json
      let contributions;
      try {
        contributions = await context.octokit.repos.getContent({
          owner: org,
          repo: targetRepo,
          path: targetFile,
          ref: "new-contributors",
        });
      } catch (error: any) {
        if ((error as any).status === 404) {
          const types = ["code", "docs", "l10n", "design", "tooling", "infra", "community", "security", "gallery", "other"];
          await context.octokit.repos.createOrUpdateFileContents({
            owner: org,
            repo: targetRepo,
            path: targetFile,
            message: "Create contributors.json",
            content: Buffer.from(JSON.stringify({ contributors: [], types: types })).toString("base64"),
            branch: "new-contributors",
          });
          contributions = await context.octokit.repos.getContent({
            owner: org,
            repo: targetRepo,
            path: targetFile,
            ref: "new-contributors",
          });
        } else {
          throw error;
        }
      }

      let content;
      if ("content" in contributions.data) {
        content = JSON.parse(Buffer.from(contributions.data.content as string, "base64").toString("utf-8"));
      } else {
        throw new Error("Could not parse contributors.json");
      }

      const contributionTypes = content.types;

      if (!contributionTypes.includes(words[3].toLowerCase())) {
        throw new Error("Invalid contribution type");
      }

      let contributor;
      try {
        contributor = await context.octokit.users.getByUsername({
          username: words[2].substring(1),
        });
      } catch (error) {
        throw error;
      }

      const newContribution = {
        login: contributor.data.login,
        name: contributor.data.name,
        avatar: contributor.data.avatar_url,
        contributionType: words[3].toLowerCase(),
        context: url,
        additionalInfo: words.slice(4).join(" "),
        createdAt: new Date().toISOString(),
      };

      // update contributors.json
      if (content.contributors.find((contributor: any) => contributor.login == newContribution.login)) {
        content.contributors.find((contributor: any) => contributor.login == newContribution.login).name = newContribution.name;
        content.contributors.find((contributor: any) => contributor.login == newContribution.login).avatar = newContribution.avatar;
        content.contributors
          .find((contributor: any) => contributor.login == newContribution.login)
          .contributions.push({
            contributionType: newContribution.contributionType,
            context: newContribution.context,
            additionalInfo: newContribution.additionalInfo,
            createdAt: newContribution.createdAt,
          });
      } else {
        // add new contributor
        content.contributors.push({
          login: newContribution.login,
          name: newContribution.name,
          avatar: newContribution.avatar,
          contributions: [
            {
              contributionType: newContribution.contributionType,
              context: newContribution.context,
              additionalInfo: newContribution.additionalInfo,
              createdAt: newContribution.createdAt,
            },
          ],
        });
      }

      if ("sha" in contributions.data) {
        await context.octokit.repos.createOrUpdateFileContents({
          owner: org,
          repo: targetRepo,
          path: targetFile,
          sha: contributions.data.sha,
          message:
            "Add @" + newContribution.login + " for " + newContribution.contributionType + " (requested in " + repo + "#" + number + ")",
          content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
          branch: "new-contributors",
        });
      } else {
        throw new Error("Could not get sha of contributors.json");
      }

      // create pull request to merge new-contributors into main
      try {
        await context.octokit.pulls.create({
          owner: org,
          repo: targetRepo,
          title: "Add new contributions",
          head: "new-contributors",
          base: targetBranch,
          body: "Recognizing new contributions.",
        });
      } catch (error) {}
    }
  });

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

  // Update contributors table in README.md based on contributors.json in main
  app.on("push", async (context) => {
    if (context.payload.repository.name != targetRepo || context.payload.ref != "refs/heads/" + targetBranch) {
      return;
    }

    // check if contributors.json was added or modified
    const files = context.payload.commits.map((commit: any) => commit.added.concat(commit.modified)).flat();
    if (!files.includes(targetFile)) {
      return;
    }

    // get contributors from contributors.json
    const contributions = await context.octokit.repos.getContent({
      owner: org,
      repo: targetRepo,
      path: targetFile,
      ref: targetBranch,
    });

    let content;
    if ("content" in contributions.data) {
      content = JSON.parse(Buffer.from(contributions.data.content as string, "base64").toString("utf-8"));
    } else {
      throw new Error("Could not parse contributors.json");
    }

    const contributors = content.contributors;

    // get README.md
    const readme = await context.octokit.repos.getContent({
      owner: org,
      repo: targetRepo,
      path: "README.md",
      ref: targetBranch,
    });

    let readmeContent;
    if ("content" in readme.data) {
      readmeContent = Buffer.from(readme.data.content as string, "base64").toString("utf-8");
    } else {
      throw new Error("Could not parse README.md");
    }

    readmeContent = renderContributors(contributors, readmeContent);

    // update README.md
    await context.octokit.repos.createOrUpdateFileContents({
      owner: org,
      repo: targetRepo,
      path: "README.md",
      sha: readme.data.sha,
      message: "Update contributors table",
      content: Buffer.from(readmeContent).toString("base64"),
      branch: targetBranch,
    });
  });
};

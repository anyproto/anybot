import { Probot } from "probot";
import contributorsRenderer from "./contributorsRenderer";

export = (app: Probot) => {
  // CONTRIBUTORS MANAGEMENT
  const targetRepo = "contributors";
  const targetFile = "contributors.json";
  const targetBranch = "main";
  const org = "anyproto";

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

    readmeContent = contributorsRenderer(contributors, readmeContent);

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

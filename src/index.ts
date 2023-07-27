import { Probot } from "probot";

export = (app: Probot) => {
  app.on("push", async (context) => {
    // anytype-ts translation update -> l10n-anytype-ts source & en-US update
    if (context.payload.repository.full_name == "anyproto/anytype-ts" && context.payload.ref == "refs/heads/main") {
      const targetFile = "src/json/text.json"

      let fileUpdated = false
      for (const commit of context.payload.commits) {
        if (commit.modified.includes(targetFile)) {
          fileUpdated = true
          break
        }
      }

      if (fileUpdated) {
        const file = await context.octokit.repos.getContent({
          owner: "anyproto",
          repo: "anytype-ts",
          path: targetFile,
        })

        if ("content" in file.data) {
          await context.octokit.repos.createOrUpdateFileContents({
            owner: "anyproto",
            repo: "l10n-anytype-ts",
            path: "text.json",
            message: "Update text.json",
            content: file.data.content,
          })
        }
      }
    }
  })
};
import { LinearClient } from "@linear/sdk";

type Team = "JS" | "GO" | "DROID" | "IOS";

const linearClient = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
const linearIssueRegex = /^(JS|GO|DROID|IOS)(-|\s)(\d{1,5})/;

const statusIds = {
  readyForDev: {
    JS: "86e9bbf0-2b4a-48ed-b3fe-adbaca446065",
    GO: "10308282-8e19-4aba-a1b3-5bcdb638d762",
    DROID: "cb303347-c935-45c4-a47e-efdfd01b5560",
    IOS: "1a01a92e-83e7-4412-8d74-9bf2189cbc74",
  },
  inProgress: {
    JS: "1eb3e32a-c87e-41b7-8d41-9ff2dcb749e8",
    GO: "74dc87c6-c212-4ad6-9690-a41ab2a123d5",
    DROID: "2db71507-6a42-4b82-868f-8db15ac038e9",
    IOS: "a24fa86b-d5f1-404b-8986-04646814b2bb",
  },
  inReview: {
    JS: "b765c61e-77b2-4612-91f3-c6f05b1cb721",
    GO: "fef8e6a8-ecea-4c03-a757-a957fd1bc259",
    DROID: "57329fd2-1897-4052-ab2a-39eb119a6825",
    IOS: "2fb9b577-5e60-4529-8a0f-7de5eab09df2",
  },
  done: {
    JS: "6cd5a339-0c05-4e52-8f1e-2a2e0bcbfa69",
    GO: "2c69c504-6061-4702-a43a-05ec038d7dae",
    DROID: "02270515-6ef0-4c3b-9d39-c584d2f3d2c0",
    IOS: "3e9d829f-5973-489d-b3f1-6783d9e60be9",
  },
};

export default {
  matchIdentifier(issue: any) {
    const match = issue.title.match(linearIssueRegex);
    const linearId = match ? match[0] : null;
    const linearTeam = match && match[1] ? match[1] : null;

    if (!linearId || !linearTeam) {
      throw new Error("Couldn't find Linear issue ID or team in the title: " + issue.title);
    }

    return { linearId, linearTeam };
  },

  async changeStatus(issue: any, status: string) {
    const { linearId, linearTeam } = this.matchIdentifier(issue);

    try {
      const linearIssue = await linearClient.issue(linearId);
      const linearStateId = statusIds[status as keyof typeof statusIds][linearTeam as Team];
      await linearIssue.update({ stateId: linearStateId });
    } catch (error) {
      throw new Error("Couldn't update Linear issue state: " + error);
    }
  },

  async postComment(issue: any, comment: string) {
    const { linearId } = this.matchIdentifier(issue);

    try {
      await linearClient.client.rawRequest(
        `mutation createComment($issueId: String!, $body: String!) {
            commentCreate(input: {issueId: $issueId, body: $body}) {
                success
                comment {
                    id
                    body
                }
            }
        }`,
        {
          issueId: linearId,
          body: comment,
        }
      );
    } catch (error) {
      throw new Error("Couldn't post comment to Linear issue: " + error);
    }
  },
};

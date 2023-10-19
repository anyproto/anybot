const { graphql } = require("@octokit/graphql");

// specify the max number of items to fetch in a single request, max is 100
const pagination = 10;
const maxPagination = 100;

// create a graphql client with authentication via access token
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

export default {
  // return the project id for a given project number in a given organization
  async getProjectID(org: string, projectNumber: number) {
    const project = await graphqlWithAuth(
      `query ($org: String!, $projectNumber: Int!) {
            organization(login: $org) {
                projectV2(number: $projectNumber) {
                    id
                }
            }
        }`,
      {
        org: org,
        projectNumber: projectNumber,
      }
    );

    return project.organization.projectV2.id;
  },

  // return the fields (e.g. Assignees, Status, Lead Contributor) for a given project id
  async getProjectFields(projectID: any) {
    return await graphqlWithAuth(
      `query ($projectID: ID!) {
            node(id: $projectID) {
                ... on ProjectV2 {
                    fields(first: $pagination) {
                        nodes {
                            ... on ProjectV2Field {
                                id
                                name
                            }
                            ... on ProjectV2IterationField {
                                id
                                name
                                configuration {
                                    iterations {
                                        startDate
                                        id
                                    }
                                }
                            }
                            ... on ProjectV2SingleSelectField {
                                id
                                name
                                options {
                                    id
                                    name
                                }
                            }
                        }
                    }
                }
            }
        }`,
      {
        projectID: projectID,
      }
    );
  },

  // return the "Status" field
  async getStatusField(projectID: any) {
    const fields = await this.getProjectFields(projectID);
    return fields?.node.fields.nodes.find((field: any) => field.name === "Status");
  },

  // return the ID of "Status" field
  async getStatusFieldID(projectID: any) {
    const statusField = await this.getStatusField(projectID);
    return statusField?.id;
  },

  // return the ID of the given status option (e.g. "🆕 New")
  async getStatusOptionID(projectID: any, statusOptionName: string) {
    const statusField = await this.getStatusField(projectID);
    return statusField?.options.find((option: any) => option.name === statusOptionName)?.id;
  },

  // return the items (issues) for a given project id
  async getProjectItems(projectID: any) {
    return await graphqlWithAuth(
      `query ($projectID: ID!, $pagination: Int!, $maxPagination: Int!) {
            node(id: $projectID) {
                ... on ProjectV2 {
                    items(first: $maxPagination) {
                        nodes{
                            id
                            fieldValues(first: $pagination) {
                                nodes{
                                    ... on ProjectV2ItemFieldTextValue {
                                        text
                                        field {
                                            ... on ProjectV2FieldCommon {
                                                name
                                            }
                                        }
                                    }
                                    ... on ProjectV2ItemFieldSingleSelectValue {
                                        name
                                        field {
                                            ... on ProjectV2FieldCommon {
                                                name
                                            }
                                        }
                                    }
                                    ... on ProjectV2ItemFieldPullRequestValue {
                                        pullRequests (first : $pagination) {
                                            nodes {
                                                title
                                                number
                                                repository {
                                                    name
                                                }
                                            }
                                        }
                                        field {
                                            ... on ProjectV2FieldCommon {
                                                name
                                            }
                                        }
                                    }
                                }
                            }
                            content{
                                ...on Issue {
                                    title
                                    number
                                    assignees(first: $pagination) {
                                        nodes{
                                            login
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }`,
      {
        projectID: projectID,
        pagination: pagination,
        maxPagination: maxPagination,
      }
    );
  },

  // return the "Issue" item
  async getIssueItem(projectID: any, issueNumber: number) {
    const items = await this.getProjectItems(projectID);
    return items?.node.items.nodes.find((item: any) => item.content.number === issueNumber);
  },

  // return the ID of "Issue" item
  async getIssueItemID(projectID: any, issueNumber: number) {
    return (await this.getIssueItem(projectID, issueNumber))?.id;
  },

  // return the "Status" field of "Issue" item
  async getIssueItemStatus(projectID: any, issueNumber: number) {
    const issueItem = await this.getIssueItem(projectID, issueNumber);
    return issueItem?.fieldValues.nodes.find((fieldValue: any) => fieldValue.field?.name === "Status")?.name;
  },

  // return "Number" and "Repository" of pull requests that are linked to this issue
  async getLinkedPullRequestNumbers(projectID: any, issueNumber: number) {
    const issueItem = await this.getIssueItem(projectID, issueNumber);
    return issueItem?.fieldValues.nodes
      .find((field: any) => field.pullRequests)
      ?.pullRequests.nodes.map((pr: any) => ({ number: pr.number, repo: pr.repository.name }));
  },

  // return "Number" of issues that are linked to this pull request
  async getLinkedIssueNumbers(projectID: any, pullRequestNumber: number, pullRequestRepo: string) {
    const projectItems = await this.getProjectItems(projectID);
    const issueItems = projectItems?.node.items.nodes.filter((item: any) =>
      item.fieldValues.nodes.some((field: any) =>
        field.pullRequests?.nodes.some((pr: any) => pr.number === pullRequestNumber && pr.repository.name === pullRequestRepo)
      )
    );

    return issueItems?.map((issueItem: any) => issueItem.content.number);
  },

  // change "Status" of an "Item" to given "Option"
  async changeItemStatus(projectID: any, itemID: any, statusFieldOption: string) {
    const statusFieldID = await this.getStatusFieldID(projectID);
    let statusFieldOptionID;
    if (["🆕 New", "🏗 In progress", "👀 In review", "✅ Done"].includes(statusFieldOption)) {
      statusFieldOptionID = await this.getStatusOptionID(projectID, statusFieldOption);
    } else {
      throw new Error("Invalid status field option: '" + statusFieldOption + "'");
    }

    try {
      await graphqlWithAuth(
        `mutation UpdateProjectItem (
                $projectId: ID!
                $itemId: ID!
                $statusFieldId: ID!
                $statusFieldOptionID: String!
            ) {
                updateProjectV2ItemFieldValue(
                    input: {
                        projectId: $projectId
                        itemId: $itemId
                        fieldId: $statusFieldId
                        value: {
                            singleSelectOptionId: $statusFieldOptionID
                        }
                    }
                ) {
                    projectV2Item {
                        id
                    }
                }
            }`,
        {
          projectId: projectID,
          itemId: itemID,
          statusFieldId: statusFieldID,
          statusFieldOptionID: statusFieldOptionID,
        }
      );
    } catch (error: any) {
      console.log(error);
    }
  },

  // return the ID of "Lead Contributor" field
  async getLeadContributorFieldID(projectID: any) {
    const fields = await this.getProjectFields(projectID);
    return fields?.node.fields.nodes.find((field: any) => field.name === "Lead Contributor")?.id;
  },

  // return value of "Lead Contributor" field
  async getLeadContributor(projectID: any, issueNumber: number) {
    const issueItem = await this.getIssueItem(projectID, issueNumber);
    return issueItem?.fieldValues.nodes.find((fieldValue: any) => fieldValue.field?.name === "Lead Contributor")?.text;
  },

  // set "Lead Contributor" field of an "Item" to "User"
  async addLeadContributor(projectID: any, itemID: any, leadContributorFieldID: any, user: any) {
    await this.updateLeadContributor(projectID, itemID, leadContributorFieldID, user);
  },

  // set "Lead Contributor" field of an "Item" to empty
  async removeLeadContributor(projectID: any, itemID: any, leadContributorFieldID: any) {
    await this.updateLeadContributor(projectID, itemID, leadContributorFieldID, "");
  },

  // put "User" into "Lead Contributor" field
  async updateLeadContributor(projectID: any, itemID: any, leadContributorFieldID: any, user: any) {
    try {
      await graphqlWithAuth(
        `mutation UpdateProjectItem (
                    $projectId: ID!
                    $itemId: ID!
                    $leadContributorFieldId: ID!
                    $user: String!
            ) {
                updateProjectV2ItemFieldValue(
                    input: {
                        projectId: $projectId
                        itemId: $itemId
                        fieldId: $leadContributorFieldId
                        value: {
                            text: $user
                        }
                    }
                ) {
                    projectV2Item {
                        id
                    }
                }
            }`,
        {
          projectId: projectID,
          itemId: itemID,
          leadContributorFieldId: leadContributorFieldID,
          user: user,
        }
      );
    } catch (error: any) {
      console.log(error);
    }
  },
};

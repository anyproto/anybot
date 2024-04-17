const { graphql } = require("@octokit/graphql");

// specify the max number of items to fetch in a single request, max is 100
const pagination = 20;
const maxPagination = 100;

// create a graphql client with authentication via access token
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

export default {
  // add a label to an issue
  async addLabel(org: string, repo: string, issueNumber: number, label: string) {
    const issueId = await this.getIssueIdByRepo(org, repo, issueNumber);
    const labelId = await this.getLabelId(org, repo, label);

    try {
      await graphqlWithAuth(
        `mutation addLabelToIssue (
                $issueId: ID!
                $labelId: ID!
            ) {
                addLabelsToLabelable(
                    input: {
                        labelableId: $issueId
                        labelIds: [$labelId]
                    }
                ) {
                    clientMutationId
                }
            }`,
        {
          issueId: issueId,
          labelId: labelId,
        }
      );
    } catch (error: any) {
      console.log(error);
    }
  },

  // remove a label from an issue
  async removeLabel(org: string, repo: string, issueNumber: number, label: string) {
    const issueId = await this.getIssueIdByRepo(org, repo, issueNumber);
    const labelId = await this.getLabelId(org, repo, label);

    try {
      await graphqlWithAuth(
        `mutation removeLabelFromIssue (
                $issueId: ID!
                $labelId: ID!
            ) {
                removeLabelsFromLabelable(
                    input: {
                        labelableId: $issueId
                        labelIds: [$labelId]
                    }
                ) {
                    clientMutationId
                }
            }`,
        {
          issueId: issueId,
          labelId: labelId,
        }
      );
    } catch (error: any) {
      console.log(error);
    }
  },

  // return the label id for a given label in an organization and repository
  async getLabelId(org: string, repo: string, label: string) {
    const data = await graphqlWithAuth(
      `query ($org: String!, $repo: String!, $label: String!) {
            repository(owner: $org, name: $repo) {
                label(name: $label) {
                    id
                }
            }
        }`,
      {
        org: org,
        repo: repo,
        label: label,
      }
    );

    return data?.repository.label.id;
  },

  // return the project id for a given project number in a given organization
  async getProjectId(org: string, projectNumber: number) {
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
  async getProjectFields(projectId: any) {
    return await graphqlWithAuth(
      `query ($projectId: ID!, $pagination: Int!) {
            node(id: $projectId) {
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
        projectId: projectId,
        pagination: pagination,
      }
    );
  },

  // return the "Status" field
  async getStatusField(projectId: any) {
    const fields = await this.getProjectFields(projectId);
    return fields?.node.fields.nodes.find((field: any) => field.name === "Status");
  },

  // return the Id of "Status" field
  async getStatusFieldId(projectId: any) {
    const statusField = await this.getStatusField(projectId);
    return statusField?.id;
  },

  // return the Id of the given status option (e.g. "🆕 New")
  async getStatusOptionId(projectId: any, statusOptionName: string) {
    const statusField = await this.getStatusField(projectId);
    return statusField?.options.find((option: any) => option.name === statusOptionName)?.id;
  },

  // return the items (issues) for a given project id
  async getProjectItems(projectId: any) {
    return await graphqlWithAuth(
      `query ($projectId: ID!, $pagination: Int!, $maxPagination: Int!) {
            node(id: $projectId) {
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
                                    repository {
                                        name
                                    }
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
        projectId: projectId,
        pagination: pagination,
        maxPagination: maxPagination,
      }
    );
  },

  // return the "Issue" item
  async getIssueItem(projectId: any, issueNumber: number) {
    const items = await this.getProjectItems(projectId);
    return items?.node.items.nodes.find((item: any) => item.content.number === issueNumber);
  },

  // return the Id of "Issue" item by project
  async getIssueItemIdByProject(projectId: any, issueNumber: number) {
    return (await this.getIssueItem(projectId, issueNumber))?.id;
  },

  // return the "Status" field of "Issue" item
  async getIssueItemStatus(projectId: any, issueNumber: number) {
    const issueItem = await this.getIssueItem(projectId, issueNumber);
    return issueItem?.fieldValues.nodes.find((fieldValue: any) => fieldValue.field?.name === "Status")?.name;
  },

  // return the Id of "Issue" by repository
  async getIssueIdByRepo(org: string, repository: string, issueNumber: number) {
    const issue = await graphqlWithAuth(
      `query ($org: String!, $repository: String!, $issueNumber: Int!) {
            repository(owner: $org, name: $repository) {
                issue(number: $issueNumber) {
                    id
                }
            }
        }`,
      {
        org: org,
        repository: repository,
        issueNumber: issueNumber,
      }
    );

    return issue?.repository.issue.id;
  },

  // add "Issue" to given project and return the Id of the new "Item"
  async addIssueToProject(projectId: any, org: string, repo: string, issueNumber: number) {
    const contentId = await this.getIssueIdByRepo(org, repo, issueNumber);
    try {
      const response = await graphqlWithAuth(
        `mutation addProjectItem (
                $projectId: ID!
                $contentId: ID!
            ) {
                addProjectV2ItemById(
                    input: {
                        projectId: $projectId
                        contentId: $contentId
                    }
                ) {
                    item {
                        id
                    }
                }
            }`,
        {
          projectId: projectId,
          contentId: contentId,
        }
      );
      return response?.addProjectV2ItemById.item.id;
    } catch (error: any) {
      console.log(error);
    }
  },

  // return "Number" and "Repository" of pull requests that are linked to this issue
  async getLinkedPullRequestNumbers(projectId: any, issueNumber: number) {
    const issueItem = await this.getIssueItem(projectId, issueNumber);
    return issueItem?.fieldValues.nodes
      .find((field: any) => field.pullRequests)
      ?.pullRequests.nodes.map((pr: any) => ({ number: pr.number, repo: pr.repository.name }));
  },

  // return "Number" of issues that are linked to this pull request
  async getLinkedIssueNumbers(projectId: any, pullRequestNumber: number, pullRequestRepo: string) {
    const projectItems = await this.getProjectItems(projectId);
    const issueItems = projectItems?.node.items.nodes.filter((item: any) =>
      item.fieldValues.nodes.some((field: any) =>
        field.pullRequests?.nodes.some((pr: any) => pr.number === pullRequestNumber && pr.repository.name === pullRequestRepo)
      )
    );

    return issueItems?.map((issueItem: any) => issueItem.content.number);
  },

  // change "Status" of an "Item" to given "Option"
  async changeItemStatus(projectId: any, itemId: any, statusFieldOption: string) {
    const statusFieldId = await this.getStatusFieldId(projectId);
    let statusFieldOptionId;
    if (["🆕 New", "🏗 In progress", "👀 In review", "✅ Done"].includes(statusFieldOption)) {
      statusFieldOptionId = await this.getStatusOptionId(projectId, statusFieldOption);
    } else {
      throw new Error("Invalid status field option: '" + statusFieldOption + "'");
    }

    try {
      await graphqlWithAuth(
        `mutation UpdateProjectItem (
                $projectId: ID!
                $itemId: ID!
                $statusFieldId: ID!
                $statusFieldOptionId: String!
            ) {
                updateProjectV2ItemFieldValue(
                    input: {
                        projectId: $projectId
                        itemId: $itemId
                        fieldId: $statusFieldId
                        value: {
                            singleSelectOptionId: $statusFieldOptionId
                        }
                    }
                ) {
                    projectV2Item {
                        id
                    }
                }
            }`,
        {
          projectId: projectId,
          itemId: itemId,
          statusFieldId: statusFieldId,
          statusFieldOptionId: statusFieldOptionId,
        }
      );
    } catch (error: any) {
      console.log(error);
    }
  },

  // return the PRs given a repository
  async getPullRequests(org: string, repository: string) {
    try {
      return await graphqlWithAuth(
        `query ($org: String!, $repository: String!, $pagination: Int!, $maxPagination: Int!) {
            repository(owner: $org, name: $repository) {
                pullRequests(first: $maxPagination) {
                    nodes {
                        title
                        number
                        repository {
                            name
                        }
                        assignees(first: $pagination) {
                            nodes {
                                login
                            }
                        }
                        merged
                        closed
                    }
                }
            }
        }`,
        {
          org: org,
          repository: repository,
          pagination: pagination,
          maxPagination: maxPagination,
        }
      );
    } catch (error: any) {
      console.log(error);
    }
  },

  // return the "PR" item given a repository and PR number
  async getPullRequestItem(org: string, repository: string, pullRequestNumber: number) {
    const pullRequests = await this.getPullRequests(org, repository);
    return pullRequests?.repository.pullRequests.nodes.find((pr: any) => pr.number === pullRequestNumber);
  },
};

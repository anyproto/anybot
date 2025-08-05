# Any Association Bot

A GitHub App for managing [Any Association repos](https://github.com/anyproto). Built with [Probot](https://github.com/probot/probot).

## Features

### Acknowledging contributions.

Responds to @any, @anybot, or @any-bot mentions.

Command format:

```
@any contributor <github_name> <type> <additional info>
```

Default contributions types:

- code,
- docs,
- l10n,
- design,
- tooling,
- infra,
- community,
- security,
- gallery,
- other

### Assigning issues.

Responds to @any, @anybot, or @any-bot mentions.

- `@any assign me`: for "New" issues, changes status to "In progress", assigns author
- `@any unassign me`: for "In progress" issues, changes status to "New", removes assignee

### Managing project boards.

Timer, works only for "In progress" issues

- On the 6th day of inactivity, posts a comment: "@{assignee}, please confirm that you’re still working on this."
- On the 7th day of inactivity, posts a comment: "@{assignee}, the issue is now available for other contributors due to inactivity", changes status to "New", and removes the assignee.
- Events related to PRs:
  - For "In progress" issues: linking a PR changes status to "In review".
  - For "In review" issues: unlinking a PR changes status to "In progress".
  - For "In review" issues: closing a PR without merging changes status to "In progress".
  - For "In review" issues: merging a PR changes status to "Done".

## Contribution

Thank you for your desire to develop Anytype together!

❤️ This project and everyone involved in it is governed by the [Code of Conduct](docs/CODE_OF_CONDUCT.md).

🧑‍💻 Check out our [contributing guide](docs/CONTRIBUTING.md) to learn about asking questions, creating issues, or submitting pull requests.

🫢 For security findings, please email [security@anytype.io](mailto:security@anytype.io) and refer to our [security guide](docs/SECURITY.md) for more information.

🤝 Follow us on [Github](https://github.com/anyproto) and join the [Contributors Community](https://github.com/orgs/anyproto/discussions).

---

Made by Any — a Swiss association 🇨🇭

Licensed under [MIT](./LICENSE.md).

"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
module.exports = function (app) {
    // Add contributor based on @any or @anybot mentioning in comment
    // command format: @any contributor <github_name> <type> <additional info>
    app.on(["discussion_comment", "issue_comment", "pull_request_review_comment"], function (context) { return __awaiter(void 0, void 0, void 0, function () {
        var targetRepo, comment, repo, number, url, words, error_1, mainBranch, contributions, error_2, types, content, contributionTypes, contributor, error_3, newContribution_1, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    targetRepo = "bot-test";
                    comment = context.payload.comment.body;
                    repo = context.payload.repository.full_name;
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
                    url = context.payload.comment.html_url;
                    words = comment.split(" ");
                    if (!((words.length >= 3) &&
                        (words[0] == "@any" || words[0] == "@anybot" || words[0] == "@any-bot") &&
                        (words[1] == "contributor") && (words[2].startsWith("@")))) return [3 /*break*/, 23];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 6]);
                    return [4 /*yield*/, context.octokit.repos.getBranch({
                            owner: "anyproto",
                            repo: targetRepo,
                            branch: "new-contributors",
                        })];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 3:
                    error_1 = _a.sent();
                    return [4 /*yield*/, context.octokit.repos.getBranch({
                            owner: "anyproto",
                            repo: targetRepo,
                            branch: "main",
                        })];
                case 4:
                    mainBranch = _a.sent();
                    return [4 /*yield*/, context.octokit.rest.git.createRef({
                            owner: "anyproto",
                            repo: targetRepo,
                            ref: "refs/heads/new-contributors",
                            sha: mainBranch.data.commit.sha,
                        })];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 6:
                    contributions = void 0;
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 9, , 13]);
                    return [4 /*yield*/, context.octokit.repos.getContent({
                            owner: "anyproto",
                            repo: targetRepo,
                            path: "contributors.json",
                            ref: "new-contributors",
                        })];
                case 8:
                    contributions = _a.sent();
                    return [3 /*break*/, 13];
                case 9:
                    error_2 = _a.sent();
                    if (!(error_2.status === 404)) return [3 /*break*/, 11];
                    types = require("./json/types.json");
                    return [4 /*yield*/, context.octokit.repos.createOrUpdateFileContents({
                            owner: "anyproto",
                            repo: targetRepo,
                            path: "contributors.json",
                            message: "Create contributors.json",
                            content: Buffer.from(JSON.stringify({ contributors: [], types: types })).toString("base64"),
                            branch: "new-contributors",
                        })];
                case 10:
                    contributions = _a.sent();
                    return [3 /*break*/, 12];
                case 11: throw error_2;
                case 12: return [3 /*break*/, 13];
                case 13:
                    content = void 0;
                    if ("content" in contributions.data) {
                        content = JSON.parse(Buffer.from(contributions.data.content, "base64").toString("utf-8"));
                    }
                    else {
                        throw new Error("Could not parse contributors.json");
                    }
                    contributionTypes = content.types;
                    if (!contributionTypes.includes(words[3].toLowerCase())) {
                        throw new Error("Invalid contribution type");
                    }
                    contributor = void 0;
                    _a.label = 14;
                case 14:
                    _a.trys.push([14, 16, , 17]);
                    return [4 /*yield*/, context.octokit.users.getByUsername({
                            username: words[2].substring(1),
                        })];
                case 15:
                    contributor = _a.sent();
                    return [3 /*break*/, 17];
                case 16:
                    error_3 = _a.sent();
                    throw error_3;
                case 17:
                    newContribution_1 = {
                        login: contributor.data.login,
                        name: contributor.data.name,
                        avatar: contributor.data.avatar_url,
                        contributionType: words[3].toLowerCase(),
                        context: url,
                        additionalInfo: words.slice(4).join(" "),
                        createdAt: new Date().toISOString(),
                    };
                    // update contributors.json
                    if (content.contributors.find(function (contributor) { return contributor.login == newContribution_1.login; })) {
                        content.contributors.find(function (contributor) { return contributor.login == newContribution_1.login; }).name = newContribution_1.name;
                        content.contributors.find(function (contributor) { return contributor.login == newContribution_1.login; }).avatar = newContribution_1.avatar;
                        content.contributors.find(function (contributor) { return contributor.login == newContribution_1.login; }).contributions.push({
                            contributionType: newContribution_1.contributionType,
                            context: newContribution_1.context,
                            additionalInfo: newContribution_1.additionalInfo,
                            createdAt: newContribution_1.createdAt,
                        });
                    }
                    else {
                        // add new contributor
                        content.contributors.push({
                            login: newContribution_1.login,
                            name: newContribution_1.name,
                            avatar: newContribution_1.avatar,
                            contributions: [
                                {
                                    contributionType: newContribution_1.contributionType,
                                    context: newContribution_1.context,
                                    additionalInfo: newContribution_1.additionalInfo,
                                    createdAt: newContribution_1.createdAt,
                                }
                            ]
                        });
                    }
                    if (!('sha' in contributions.data)) return [3 /*break*/, 19];
                    return [4 /*yield*/, context.octokit.repos.createOrUpdateFileContents({
                            owner: "anyproto",
                            repo: targetRepo,
                            path: "contributors.json",
                            sha: contributions.data.sha,
                            message: "Add @" + newContribution_1.login + " for " + newContribution_1.contributionType + " (requested in " + repo + "#" + number + ")",
                            content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
                            branch: "new-contributors",
                        })];
                case 18:
                    _a.sent();
                    return [3 /*break*/, 20];
                case 19: throw new Error("Could not get sha of contributors.json");
                case 20:
                    _a.trys.push([20, 22, , 23]);
                    return [4 /*yield*/, context.octokit.pulls.create({
                            owner: "anyproto",
                            repo: targetRepo,
                            title: "Add new contributions",
                            head: "new-contributors",
                            base: "main",
                            body: "Recognizing new contributions.",
                        })];
                case 21:
                    _a.sent();
                    return [3 /*break*/, 23];
                case 22:
                    error_4 = _a.sent();
                    return [3 /*break*/, 23];
                case 23: return [2 /*return*/];
            }
        });
    }); });
};
//# sourceMappingURL=index.js.map
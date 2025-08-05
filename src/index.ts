import { Probot } from "probot";
import contributorsManager from "./contributorsManager.js";
import projectManager from "./projectManager.js";

export default (app: Probot) => {
  contributorsManager(app);
  projectManager(app);
};

import { Probot } from "probot";
import contributorsManagement from "./contributorsManagement";
import projectManagement from "./projectManagement";

export = (app: Probot) => {
  contributorsManagement(app);
  projectManagement(app);
};

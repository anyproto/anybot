import { Probot } from "probot";
import contributorsManager from "./contributorsManager";
import projectManager from './projectManager';

export = (app: Probot) => {
  contributorsManager(app);
  projectManager(app);
};

import * as core from "@actions/core";

export const boolOutput = (name: string, value: boolean) => {
  core.setOutput(name, value ? "true" : "false");
};

export const stringOutput = (name: string, value: string | number | undefined | null) => {
  core.setOutput(name, value == null ? "" : String(value));
};

export const multilineOutput = (name: string, values: string[]) => {
  core.setOutput(name, values.join("\n"));
};

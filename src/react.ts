import * as core from "@actions/core";
import { getOctokit } from "./github.js";

const reactions = new Set([
  "THUMBS_UP",
  "THUMBS_DOWN",
  "LAUGH",
  "HOORAY",
  "CONFUSED",
  "HEART",
  "ROCKET",
  "EYES",
]);

const reactionContent = (value: string | undefined, fallback = "") => {
  const content = value || fallback;
  if (!content) {
    return "";
  }
  if (!reactions.has(content)) {
    throw new Error(`Unsupported reaction content: ${content}`);
  }
  return content;
};

const main = async () => {
  const subjectId = process.env.REACTION_SUBJECT_ID;
  if (!subjectId) {
    return;
  }

  const octokit = getOctokit();
  const removeContent = reactionContent(process.env.REMOVE_REACTION_CONTENT);
  const addContent = reactionContent(process.env.ADD_REACTION_CONTENT, "THUMBS_UP");

  if (removeContent) {
    try {
      await octokit.graphql(
        `mutation RemoveReaction($subjectId: ID!, $content: ReactionContent!) {
          removeReaction(input: { subjectId: $subjectId, content: $content }) { subject { id } }
        }`,
        { subjectId, content: removeContent },
      );
    } catch (error) {
      core.warning(
        `Could not remove ${removeContent} reaction: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (addContent) {
    try {
      await octokit.graphql(
        `mutation AddReaction($subjectId: ID!, $content: ReactionContent!) {
          addReaction(input: { subjectId: $subjectId, content: $content }) { reaction { content } }
        }`,
        { subjectId, content: addContent },
      );
    } catch (error) {
      core.warning(
        `Could not add ${addContent} reaction: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
};

await main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});

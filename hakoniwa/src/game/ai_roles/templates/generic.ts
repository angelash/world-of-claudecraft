// Prompt text of the * role pack (Chinese, D-077: prompts stay in the source
// language). Kept out of the role module so the kernel text ratchet can skip prompt
// templates (release_engineering.md 8.4); see ../generic.ts.

import type { RolePrompt } from './common';

export const GENERIC_PROMPT: RolePrompt = {
  intro:
    '你在《箱庭纪》的世界里扮演题面描述的这个角色，为眼前的情况做一个决定。题面会给出角色是谁、眼下的处境与可用命令。',
  rules: [
    '按人设与处境，从【可用命令】中选择合适的命令，至多三条；参数按说明填写。',
    '没有合适的命令就写空的 commands。',
    '需要开口时写进 speech，至多八十字；心声至多一百字。',
  ],
};

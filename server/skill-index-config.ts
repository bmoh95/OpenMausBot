const configuredIndexBytes = Number(process.env.OMB_SKILL_INDEX_BYTES);
export const INDEX_MAX_BYTES = Number.isInteger(configuredIndexBytes) && configuredIndexBytes >= 4_000 && configuredIndexBytes <= 64_000 ? configuredIndexBytes : 4_000;
export const loggedIndexOmissions = new Map<string, string>();

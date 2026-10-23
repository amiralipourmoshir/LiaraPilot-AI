import { z } from 'zod';
const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const manifestSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  commit: sha,
  files: z.array(z.object({ path: z.string(), sha, size: z.number().int().nonnegative() })),
  excluded: z.array(z.string()),
  framework: z.string(),
  private: z.boolean().default(false),
  analysis: z
    .object({
      platform: z.string(),
      platformConfig: z
        .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
        .default({}),
      runtimes: z.array(z.string()).default([]),
      roots: z.array(z.string()).default([]),
      scripts: z.record(z.string(), z.string()).default({}),
      install: z.string().nullable(),
      build: z.string().nullable(),
      port: z.number().int(),
      healthPath: z.string(),
      expectedText: z.string(),
      outputDir: z.string().nullable(),
      root: z.string(),
      environmentNames: z.array(z.string()),
      databases: z.array(z.string()),
      minRamGb: z.number(),
      confidence: z.string(),
    })
    .optional(),
  start: z.string().nullable(),
  blockers: z.array(z.string()),
  evidence: z.array(z.object({ path: z.string(), finding: z.string() })),
});
export type RepositoryManifest = z.infer<typeof manifestSchema>;

import { CreateNodesContextV2, createNodesFromFiles, CreateNodesV2 } from '@nx/devkit';
import { existsSync } from 'fs';
import { dirname, join } from 'path';

export interface TsDownPluginOptions {
    buildTarget?: string;
}

export const createNodesV2: CreateNodesV2<TsDownPluginOptions> = [
    '**/tsconfig.json',
    async (configFiles, options, context) => {
        return await createNodesFromFiles(
            (configFile, options, context) =>
                createNodesInternal(configFile, options, context),
            configFiles,
            options,
            context
        );
    },
];

async function createNodesInternal(
    configFilePath: string,
    options?: TsDownPluginOptions,
    context?: CreateNodesContextV2
) {
    // bypass ts warning
    if (context) {
        //
    }

    const buildTarget = options?.buildTarget ?? 'build';

    const projectRoot = dirname(configFilePath);

    const isTsDownProject =
        existsSync(join(projectRoot, 'tsdown.config.ts'))
    if (!isTsDownProject) {
        return {};
    }

    return {
        projects: {
            [projectRoot]: {
                targets: {
                    [buildTarget]: {
                        command: `tsdown`,
                        options: {                           
                            cwd: '{projectRoot}'
                        }
                    },
                },
            },
        },
    };
}
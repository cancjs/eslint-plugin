import type { TSESLint } from '@typescript-eslint/utils';

export interface CancSettings {
 sources?: string[];
 cancelableTypeNames?: string[];
 lazyTypeNames?: string[];
 structuralDetection?: boolean;
 boundaryFunctions?: string[];
}

export interface ResolvedCancSettings {
 sources: string[];
 cancelableTypeNames: string[];
 lazyTypeNames: string[];
 structuralDetection: boolean;
 boundaryFunctions: string[];
}

const DEFAULT_SOURCES = [
 '@cancjs/promise',
 '@cancjs/promise/native',
 '@cancjs/coroutine',
 '@cancjs/coroutine/native',
 '@cancjs/coroutine/iter',
 '@cancjs/fetch',
 '@cancjs/fetch/native',
 '@cancjs/toolbox',
 '@cancjs/toolbox/native',
 '@cancjs/lazy-promise',
 '@cancjs/lazy-promise/native',
 '@cancjs/decorators',
 '@cancjs/decorators/native',
];

const DEFAULT_SETTINGS: ResolvedCancSettings = {
 sources: DEFAULT_SOURCES,
 cancelableTypeNames: ['CancelablePromise'],
 lazyTypeNames: ['LazyPromise'],
 structuralDetection: false,
 boundaryFunctions: ['catchCancel', 'suppressCancel'],
};

export function getCancSettings(
 context: TSESLint.RuleContext<string, unknown[]>
): ResolvedCancSettings {
 const settings = context.settings.canc as CancSettings | undefined;

 if (!settings) {
 return DEFAULT_SETTINGS;
 }

 return {
 sources: settings.sources ? [...DEFAULT_SOURCES, ...settings.sources] : DEFAULT_SOURCES,
 cancelableTypeNames: settings.cancelableTypeNames
 ? [...DEFAULT_SETTINGS.cancelableTypeNames, ...settings.cancelableTypeNames]
 : DEFAULT_SETTINGS.cancelableTypeNames,
 lazyTypeNames: settings.lazyTypeNames
 ? [...DEFAULT_SETTINGS.lazyTypeNames, ...settings.lazyTypeNames]
 : DEFAULT_SETTINGS.lazyTypeNames,
 structuralDetection:
 settings.structuralDetection !== undefined
 ? settings.structuralDetection
 : DEFAULT_SETTINGS.structuralDetection,
 boundaryFunctions: settings.boundaryFunctions
 ? [...DEFAULT_SETTINGS.boundaryFunctions, ...settings.boundaryFunctions]
 : DEFAULT_SETTINGS.boundaryFunctions,
 };
}

import type { TSESLint } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';

import { getCancSettings } from '../src/util/settings.js';

describe('settings', () => {
 it('default sources include @cancjs/promise', () => {
 const mockContext = {
 settings: {},
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.sources).toContain('@cancjs/promise');
 });

 it('default sources include @cancjs/toolbox/native', () => {
 const mockContext = {
 settings: {},
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.sources).toContain('@cancjs/toolbox/native');
 });

 it('default sources include @cancjs/coroutine/iter', () => {
 const mockContext = {
 settings: {},
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.sources).toContain('@cancjs/coroutine/iter');
 });

 it('user-provided sources extend defaults', () => {
 const mockContext = {
 settings: {
 canc: {
 sources: ['@my/custom-promise'],
 },
 },
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.sources).toContain('@cancjs/promise');
 expect(settings.sources).toContain('@my/custom-promise');
 expect(settings.sources).toHaveLength(14); // 13 defaults + 1 custom
 });

 it('default cancelableTypeNames include CancelablePromise', () => {
 const mockContext = {
 settings: {},
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.cancelableTypeNames).toContain('CancelablePromise');
 });

 it('default lazyTypeNames include LazyPromise', () => {
 const mockContext = {
 settings: {},
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.lazyTypeNames).toContain('LazyPromise');
 });

 it('default structuralDetection is false', () => {
 const mockContext = {
 settings: {},
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.structuralDetection).toBe(false);
 });

 it('default boundaryFunctions include catchCancel and suppressCancel', () => {
 const mockContext = {
 settings: {},
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.boundaryFunctions).toContain('catchCancel');
 expect(settings.boundaryFunctions).toContain('suppressCancel');
 });

 it('user-provided cancelableTypeNames extend defaults', () => {
 const mockContext = {
 settings: {
 canc: {
 cancelableTypeNames: ['MyCustomCancelable'],
 },
 },
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.cancelableTypeNames).toContain('CancelablePromise');
 expect(settings.cancelableTypeNames).toContain('MyCustomCancelable');
 });

 it('user-provided lazyTypeNames extend defaults', () => {
 const mockContext = {
 settings: {
 canc: {
 lazyTypeNames: ['MyLazyPromise'],
 },
 },
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.lazyTypeNames).toContain('LazyPromise');
 expect(settings.lazyTypeNames).toContain('MyLazyPromise');
 });

 it('user-provided boundaryFunctions extend defaults', () => {
 const mockContext = {
 settings: {
 canc: {
 boundaryFunctions: ['myBoundary'],
 },
 },
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.boundaryFunctions).toContain('catchCancel');
 expect(settings.boundaryFunctions).toContain('suppressCancel');
 expect(settings.boundaryFunctions).toContain('myBoundary');
 });

 it('user-provided structuralDetection overrides default', () => {
 const mockContext = {
 settings: {
 canc: {
 structuralDetection: true,
 },
 },
 } as unknown as TSESLint.RuleContext<string, unknown[]>;

 const settings = getCancSettings(mockContext);

 expect(settings.structuralDetection).toBe(true);
 });
});

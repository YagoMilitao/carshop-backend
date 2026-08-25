import { ModuleMocker } from 'jest-mock';

type ModuleMockerWithScope = InstanceType<typeof ModuleMocker> & {
  clearMocksOnScope?: (scope: Record<string, unknown>) => void;
};

const moduleMockerPrototype = ModuleMocker.prototype as ModuleMockerWithScope;

if (typeof moduleMockerPrototype.clearMocksOnScope !== 'function') {
  moduleMockerPrototype.clearMocksOnScope = function clearMocksOnScope(
    this: ModuleMockerWithScope,
    scope: Record<string, unknown>,
  ): void {
    for (const key of Object.keys(scope)) {
      const value = scope[key];

      if (
        value != null &&
        (typeof value === 'object' || typeof value === 'function') &&
        '_isMockFunction' in value &&
        this.isMockFunction(value) &&
        typeof (value as { mockClear?: unknown }).mockClear === 'function'
      ) {
        (value as { mockClear: () => void }).mockClear();
      }
    }
  };
}

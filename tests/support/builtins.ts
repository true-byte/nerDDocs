import { syncBuiltinESMExports } from 'node:module';

/** Replaces one function of a Node module for all code, and gives the function that puts it back. */
export function replaceBuiltin<Module extends object, Name extends keyof Module>(
  module: Module,
  name: Name,
  standIn: Module[Name],
): () => void {
  const real = module[name];
  Object.assign(module, { [name]: standIn });
  syncBuiltinESMExports();
  return () => {
    Object.assign(module, { [name]: real });
    syncBuiltinESMExports();
  };
}

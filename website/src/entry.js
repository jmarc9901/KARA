/**
 * Browser entry for the static KARA playground.
 * Exposes the compiler and interpreter APIs as the `Kara` global.
 */
import { compile, COMPONENT_SCHEMA, BUILTIN_NAMES } from '../../compiler/src/parser.js';
import {
  evalInitialState,
  computeDerived,
  runHandler,
  createContext,
  DEFAULT_BUILTINS,
  formatValue,
} from '../../runtime/src/interpreter.js';

window.Kara = {
  compile,
  COMPONENT_SCHEMA,
  BUILTIN_NAMES,
  evalInitialState,
  computeDerived,
  runHandler,
  createContext,
  DEFAULT_BUILTINS,
  formatValue,
};

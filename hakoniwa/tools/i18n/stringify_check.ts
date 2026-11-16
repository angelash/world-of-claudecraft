// Implicit TextRef stringification finder (PK-M0-14). TypeScript lets an object slip into
// a template literal, a `+` concatenation, Array.prototype.join or String(), where a TextRef
// silently becomes "[object Object]". This walks the project with the type checker and
// lists every such spot whose operand type can hold a TextRef (KeyText or RawText).
//   node tools/i18n/stringify_check.ts [path-fragment ...]
// With fragments, only files whose path contains one of them are reported. Exit code 1
// when anything is found.

import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..', '..');
const TEXT_TYPES = new Set(['KeyText', 'RawText']);

function holdsText(type: ts.Type, checker: ts.TypeChecker, depth = 0): boolean {
  if (depth > 4) return false;
  if (type.isUnion() || type.isIntersection())
    return type.types.some((t) => holdsText(t, checker, depth + 1));
  const sym = type.aliasSymbol ?? type.getSymbol();
  if (sym && TEXT_TYPES.has(sym.getName())) return true;
  return false;
}

function arrayElementHoldsText(type: ts.Type, checker: ts.TypeChecker): boolean {
  const parts = type.isUnion() ? type.types : [type];
  for (const p of parts) {
    if (checker.isArrayType(p) || checker.isTupleType(p)) {
      const args = checker.getTypeArguments(p as ts.TypeReference);
      if (args.some((a) => holdsText(a, checker))) return true;
    }
  }
  return false;
}

export interface Finding {
  file: string;
  line: number;
  kind: 'template' | 'concat' | 'join' | 'String';
  text: string;
}

export function findImplicitStringify(filters: readonly string[] = []): Finding[] {
  const configPath = join(ROOT, 'tsconfig.json');
  const cfg = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const out: Finding[] = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    const rel = relative(ROOT, sf.fileName).split(sep).join('/');
    if (rel.startsWith('..') || rel.includes('node_modules')) continue;
    if (filters.length && !filters.some((f) => rel.includes(f))) continue;
    const add = (node: ts.Node, kind: Finding['kind']) => {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      out.push({ file: rel, line, kind, text: node.getText(sf).slice(0, 120) });
    };
    const visit = (node: ts.Node): void => {
      if (ts.isTemplateSpan(node) && !ts.isTaggedTemplateExpression(node.parent.parent)) {
        if (holdsText(checker.getTypeAtLocation(node.expression), checker))
          add(node.expression, 'template');
      } else if (
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
          node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)
      ) {
        const l = checker.getTypeAtLocation(node.left);
        const r = checker.getTypeAtLocation(node.right);
        if (holdsText(l, checker) || holdsText(r, checker)) add(node, 'concat');
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === 'join' &&
          arrayElementHoldsText(checker.getTypeAtLocation(callee.expression), checker)
        ) {
          add(node, 'join');
        } else if (
          ts.isIdentifier(callee) &&
          callee.text === 'String' &&
          node.arguments[0] &&
          holdsText(checker.getTypeAtLocation(node.arguments[0]), checker)
        ) {
          add(node, 'String');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/i18n/stringify_check.ts');
if (isMain) {
  const found = findImplicitStringify(process.argv.slice(2));
  for (const f of found) process.stdout.write(`${f.file}:${f.line} [${f.kind}] ${f.text}\n`);
  process.stdout.write(`${found.length} implicit TextRef stringification(s)\n`);
  process.exitCode = found.length ? 1 : 0;
}

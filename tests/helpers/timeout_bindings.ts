import ts from 'typescript';

/** Unique module constants only: imports and shadowed bindings remain unresolved. */
export function moduleTimeoutConstants(
  source: string,
): ReadonlyMap<string, { from: number; to: number }> {
  const tree = ts.createSourceFile('timeouts.ts', source, ts.ScriptTarget.Latest, true);
  const imports = new Set<string>();
  const counts = new Map<string, number>();
  const constants = new Map<string, { from: number; to: number }>();
  const visit = (node: ts.Node): void => {
    const binding =
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)
        ? node.name
        : undefined;
    if (binding && ts.isIdentifier(binding)) {
      counts.set(binding.text, (counts.get(binding.text) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const clause = statement.importClause;
      if (clause.name) imports.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) imports.add(binding.name.text);
      } else if (bindings && ts.isNamespaceImport(bindings)) imports.add(bindings.name.text);
    }
    if (
      ts.isVariableStatement(statement) &&
      (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          constants.set(declaration.name.text, {
            from: declaration.initializer.getStart(tree),
            to: declaration.initializer.end,
          });
        }
      }
    }
  }
  for (const name of constants.keys()) {
    if (imports.has(name) || counts.get(name) !== 1) constants.delete(name);
  }
  return constants;
}

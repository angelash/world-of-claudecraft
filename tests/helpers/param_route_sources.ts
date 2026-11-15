import ts from 'typescript';

/** Literal RegExp.exec route declarations, with regex classes and comments parsed as code. */
export function paramRouteRegexSources(text: string): Set<string> {
  const source = ts.createSourceFile('routes.ts', text, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text.endsWith('Match') &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isPropertyAccessExpression(node.initializer.expression) &&
      node.initializer.expression.name.text === 'exec' &&
      ts.isRegularExpressionLiteral(node.initializer.expression.expression)
    ) {
      const literal = node.initializer.expression.expression.getText(source);
      const close = literal.lastIndexOf('/');
      found.add(new RegExp(literal.slice(1, close), literal.slice(close + 1)).source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

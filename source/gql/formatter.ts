import { GraphQLError } from "graphql";

export function formatter(err: GraphQLError, query: string): Error {
  const location = err.locations?.[0];
  if (!location) return new Error(`GraphQL syntax error: ${err.message}`);

  const lines = query.split('\n');
  const errorLine = lines[location.line - 1] || '';
  const pointer = ' '.repeat(Math.max(0, location.column - 1)) + '^';

  return new Error(
    `GraphQL syntax error in gql tag:\n` +
    `${err.message}\n\n` +
    `  ${location.line} | ${errorLine}\n` +
    `      ${pointer}\n` +
    `at line ${location.line}, column ${location.column}`
  );
};

export function interpolation(...values: unknown[]): void {
  if (values.length > 0) {
    throw new Error(
      'gql tag does not support interpolation.\n' +
      'Use GraphQL variables instead:\n\n' +
      '  // BAD:\n' +
      '  gql`query { user(id: ${id}) }`\n\n' +
      '  // GOOD:\n' +
      '  gql`query($id: ID!) { user(id: $id) }`'
    );
  };
};

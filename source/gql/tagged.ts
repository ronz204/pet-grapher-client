import { formatter } from "./formatter";
import { interpolation } from "./polation";
import { parse, GraphQLError } from "graphql";
import type { TypedQueryDocumentNode } from "graphql";

export function gql<TData = unknown, TVariables = unknown>(
  strings: TemplateStringsArray, ...values: unknown[]
): TypedQueryDocumentNode<TData, TVariables> {

  interpolation(...values);
  const query = strings.raw.join('');

  try {
    const document = parse(query);
    return document as TypedQueryDocumentNode<TData, TVariables>;
    
  } catch (err) {
    if (err instanceof GraphQLError) {
      throw formatter(err, query);
    };
    throw err;
  };
};

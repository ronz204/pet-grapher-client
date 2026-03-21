import { GraphQLError } from "graphql";

export type GqlNetworkError = {
  type: "network";
  message: string;
};

export type GqlTimeoutError = {
  type: "timeout";
  ms: number;
};

export type GqlResponseError = {
  type: "response";
  errors: GraphQLError[];
};

export type GqlError = GqlNetworkError | GqlTimeoutError | GqlResponseError;

/**
 * Utility functions for MCP client operations
 */

/**
 * Validates that the ember-onchain MCP client is available
 * @param context - The agent context
 * @throws Error if the ember-onchain client is not available
 */
export function validateEmberClient(context: any): void {
  if (!context.mcpClients || !context.mcpClients['ember-onchain']) {
    throw new Error(
      'Ember MCP client (ember-onchain) is not available. Please ensure it is properly configured in the skill mcpServers configuration.'
    );
  }
}

/**
 * Gets the ember-onchain MCP client from context with validation
 * @param context - The agent context
 * @returns The ember-onchain MCP client
 * @throws Error if the ember-onchain client is not available
 */
export function getEmberClient(context: any) {
  validateEmberClient(context);
  return context.mcpClients['ember-onchain'];
}

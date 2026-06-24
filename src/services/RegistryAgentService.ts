/**
 * RegistryAgentService.ts
 * Contains the interface contract for the RegistryAgentService, a service responsible for managing
 * the lifecycle of agents (API keys) for a specific registry.
 */

import { DatabaseError } from "../error/DatabaseError";
import { IllegalArgumentError } from "../error/IllegalArgumentError";
import { ActorPermissions } from "../model/ActorPermissions";
import { RegistryAgent } from "../model/RegistryAgent";

export interface RegistryAgentService {

    /**
     * Gets a registry agent by the specified ID
     * @param agentId the ID of the registry agent to get
     * @returns a promise of the registry agent if found, or undefined
     * @throws { DatabaseError } if the database fails
     */
    getAgentById(agentId: number): Promise<RegistryAgent | undefined>;

    /**
     * Gets a registry agent by the specified hash
     * @param hash the hash of the registry agent to get
     * @returns a promise of the registry agent if found, or undefined
     * @throws { DatabaseError } if the database fails
     */
    getAgentByHash(hash: string): Promise<RegistryAgent | undefined>;

    /**
     * Gets a list of registry agents for a particular registry, by the ID of the registry
     * @param registryId the ID of the registry to get agents for
     * @returns a promise of a list of registry agents
     * @throws { DatabaseError } if the database fails
     */
    getAgentsInRegistry(registryId: number): Promise<RegistryAgent[]>;

    /**
     * Creates a registry agent by the specified parameters.
     * - The name of the registry agent must be alphanumeric and underscores, no spaces
     * - The name of the registry agent must be between 1-255 characters long
     * - The name of the registry agent must not already be in use for that registry
     * - The creator of the registry agent must exist (by ID)
     * - The registry must exist (by ID)
     * @param registryId the ID of the registry that the agent is for
     * @param name the name of the registry agent
     * @param creatorId the ID of the user who created the agent
     * @returns a promise that resolves to the newly created registry agent
     * @throws { IllegalArgumentError } if the name is invalid, or the registry/creator does not exist
     * @throws { DatabaseError } if the database fails
     */
    createAgent(registryId: number, name: string, creatorId: number): Promise<RegistryAgent>;

    /**
     * Updates a registry agent's name
     * - The name of the registry agent must be alphanumeric and underscores, no spaces
     * - The name of the registry agent must be between 1-255 characters long
     * - The name of the registry agent must not already be in use for that registry
     * @param agentId the ID of the registry agent to update
     * @param name the new name for the registry agent
     * @throws { IllegalArgumentError } if the name is invalid, or the agent does not exist
     * @throws { DatabaseError } if the database fails
     */
    updateAgentName(agentId: number, name: string): Promise<void>;

    /**
     * Updates a registry agent's key-hash. Particularly, the hash will be regenerated then returned
     * @param agentId the ID of the registry agent to update
     * @returns a promise that resolves to the new key hash
     * @throws { IllegalArgumentError } if the agent does not exist
     * @throws { DatabaseError } if the database fails
     */
    updateAgentHash(agentId: number): Promise<string>;

    /**
     * Deletes a registry agent. If the registry agent does not exist, nothing will happen
     * @param agentId the ID of the registry agent to delete
     * @throws { DatabaseError } if the database fails
     */
    deleteAgent(agentId: number): Promise<void>;
}
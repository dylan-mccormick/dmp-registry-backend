/**
 * RegistryAgent.ts
 * This file defines the RegistryAgent class, which represents an agent in the system. An agent is a non-human actor that can have permissions on registries, similar to a user.
 * Examples of agents could include service accounts, applications, or other systems that need to interact with registries.
 */

import z from "zod";
import { Actor } from "./Actor";

export interface RegistryAgentDictionary {
    id: number;
    registryId: number;
    name: string;
    createdAt: Date;
    createdByUserId?: number;
}

const RegistryAgentFromObjectSchema = z.object({
    id: z.number().positive(),
    registryId: z.number().positive(),
    name: z.string().max(255),
    createdAt: z.date(),
    createdByUserId: z.number().positive().optional()
});

export class RegistryAgent extends Actor {

    readonly #id: number;
    readonly #registryId: number;
    readonly #name: string;
    readonly #createdAt: Date;
    readonly #createdByUserId?: number;

    /**
     * Constructor for the RegistryAgent class.
     * @param id the id of the registry agent
     * @param registryId the id of the registry that the agent corresponds to
     * @param name the name of the agent
     * @param createdAt the time the agent was created at
     * @param createdByUserId the id of the user who created it
     */
    constructor(id: number, registryId: number, name: string, createdAt: Date, createdByUserId?: number) {
        super()

        this.#id = id;
        this.#registryId = registryId;
        this.#name = name;
        this.#createdAt = createdAt;
        this.#createdByUserId = createdByUserId;
    }

    /**
     * Gets the id of the registry agent.
     * @return the id of the registry agent
     */
    get id(): number {
        return this.#id;
    }

    /**
     * Gets the id of the registry that the agent corresponds to.
     * @return the id of the registry that the agent corresponds to
     */
    get registryId(): number {
        return this.#registryId;
    }

    /**
     * Gets the name of the registry agent.
     * @return the name of the registry agent
     */
    get name(): string {
        return this.#name;
    }

    /**
     * Gets when the registry agent was created at.
     * @return when the registry agent was created at
     */
    get createdAt(): Date {
        return this.#createdAt;
    }

    /**
     * Gets the id of the user who created the registry agent, if available.
     * @return the id of the user who created the registry agent, or undefined if not available
     */
    get createdByUserId(): number | undefined {
        return this.#createdByUserId;
    }

    /**
     * Converts the registry agent to a dictionary representation.
     * @returns a dictionary representation of the Registry Agent
     */
    public toDictionary(): RegistryAgentDictionary {
        return {
            id: this.#id,
            registryId: this.#registryId,
            name: this.#name,
            createdAt: this.#createdAt,
            createdByUserId: this.#createdByUserId
        };
    }

    /**
     * Creates a registry agent from a plain object, validating the structure of the object in the process.
     * @param obj the object create the registry agent from
     * @returns the created registry agent, if possible
     */
    public fromObject(obj: any): RegistryAgent {
        const parsed = RegistryAgentFromObjectSchema.safeParse(obj);
        if (!parsed.success) {
            throw new Error(`Invalid registry agent object: ${parsed.error.message}`);
        }

        const { id, registryId, name, createdAt, createdByUserId } = parsed.data;
        return new RegistryAgent(id, registryId, name, createdAt, createdByUserId);
    }

    public equals(other: any): boolean {
        if (!(other instanceof RegistryAgent)) {
            return false;
        }
        return this.#id === other.id;
    }

    public toString(): string {
        return `RegistryAgent(id=${this.#id}, registryId=${this.#registryId}, name=${this.#name})`;
    }

}
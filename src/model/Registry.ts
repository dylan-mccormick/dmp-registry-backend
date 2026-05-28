/**
 * Registry.ts
 * This file defines the Registry class, which represents a registry in the system.
 */

import z from "zod";
import { RegistryType } from "./RegistryType";

const RegistryFromObjectSchema = z.object({
    id: z.number().positive(),
    name: z.string().max(255),
    type: z.enum(RegistryType),
    storageLocation: z.string().max(255),
    createdAt: z.coerce.date(),
    createdByUserId: z.number().positive().optional()
});

export interface RegistryDictionary {
    id: number;
    name: string;
    type: RegistryType;
    storageLocation: string;
    createdAt: Date;
    createdByUserId?: number;
}

export class Registry {
    readonly #id: number;
    readonly #name: string
    readonly #type: RegistryType;
    readonly #storageLocation: string;
    readonly #createdAt: Date;
    readonly #createdByUserId?: number;

    /**
     * Constructor for the Registry class.
     * @param id the id of the registry
     * @param name the name of the registry
     * @param type the type of the registry
     * @param storageLocation the location where files are stored for the registry
     * @param createdAt the time the registry was created at
     */
    constructor(id: number, name: string, type: RegistryType, storageLocation: string, createdAt: Date, createdByUserId?: number) {
        this.#id = id;
        this.#name = name;
        this.#type = type;
        this.#storageLocation = storageLocation;
        this.#createdAt = createdAt;
        this.#createdByUserId = createdByUserId;
    }

    /**
     * Creates a registry from a plain object, validating the structure of the object in the process.
     * @param obj the object to create the registry from
     * @returns the created registry, if possible
     */
    public static fromObject(obj: any): Registry {
        const parsed = RegistryFromObjectSchema.safeParse(obj);
        if (!parsed.success) {
            throw new Error(`Invalid registry object: ${parsed.error.message}`);
        }

        const { id, name, type, storageLocation, createdAt, createdByUserId } = parsed.data;
        return new Registry(id, name, type, storageLocation, createdAt, createdByUserId);
    }

    /**
     * Gets the id of the registry.
     * @return the id of the registry
     */
    get id(): number {
        return this.#id;
    }

    /**
     * Gets the name of the registry.
     * @return the name of the registry
     */
    get name(): string {
        return this.#name;
    }

    /**
     * Gets the type of the registry.
     * @return the type of the registry
     */
    get type(): RegistryType {
        return this.#type;
    }

    /**
     * Gets the storage location of the registry.
     * @return the storage location of the registry
     */
    get storageLocation(): string {
        return this.#storageLocation;
    }

    /**
     * Gets when the registry was created at.
     * @return when the registry was created at
     */
    get createdAt(): Date {
        return this.#createdAt;
    }

    get createdByUserId(): number | undefined {
        return this.#createdByUserId;
    }

    /**
     * Converts the registry to a dictionary representation.
     * @returns a dictionary representation of the registry
     */
    public toDictionary(): RegistryDictionary {
        return {
            id: this.#id,
            name: this.#name,
            type: this.#type,
            storageLocation: this.#storageLocation,
            createdAt: this.#createdAt,
            createdByUserId: this.#createdByUserId
        };
    }

    public equals(other: any): boolean {
        if (!(other instanceof Registry)) {
            return false;
        }

        return this.#id === other.#id &&
            this.#name === other.#name &&
            this.#type === other.#type &&
            this.#createdByUserId === other.#createdByUserId &&
            this.#storageLocation === other.#storageLocation &&
            this.#createdAt.getTime() === other.#createdAt.getTime();
    }

    public toString(): string {
        return `Registry(id=${this.#id}, name=${this.#name}, type=${this.#type}, storageLocation=${this.#storageLocation}, createdAt=${this.#createdAt.toISOString()}, createdByUserId=${this.#createdByUserId})`;
    }
}
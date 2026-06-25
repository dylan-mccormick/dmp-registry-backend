/**
 * RegistryAgentServiceImpl.ts
 * Contains an implementation for the RegistryAgentService interface contract.
 */

import { AxiosInstance } from "axios";
import { RegistryAgentService } from "./RegistryAgentService";
import { RegistryAgent } from "../model/RegistryAgent";
import { ActorPermissions } from "../model/ActorPermissions";
import { UsersAuthService } from "./UsersAuthService";
import { RegistryLifecycleService } from "./RegistryLifecycleService";
import { DatabaseError } from "../error/DatabaseError";
import { IllegalArgumentError } from "../error/IllegalArgumentError";
import { generateSecureAlphanumeric } from "../Utils";
import { AxiosError } from "axios";

export class RegistryAgentServiceImpl implements RegistryAgentService {

    readonly #dbApi: AxiosInstance;
    readonly #usersAuthService: UsersAuthService;
    readonly #registryLifecycleService: RegistryLifecycleService;

    /**
     * Constructor for the RegistryAgentServiceImpl class.
     * @param dbApi the DB API to use
     * @param usersAuthService the UsersAuthService
     * @param registryLifecycleService the RegistryLifecycleService
     */
    constructor(dbApi: AxiosInstance, usersAuthService: UsersAuthService, registryLifecycleService: RegistryLifecycleService) {
        this.#dbApi = dbApi;
        this.#usersAuthService = usersAuthService;
        this.#registryLifecycleService = registryLifecycleService;
    }

    private async getNextAgentKey(): Promise<string> {
        const candidate = generateSecureAlphanumeric(128);
        if (await this.getAgentByHash(candidate)) return this.getNextAgentKey();
        return Promise.resolve(candidate);
    }

    private coerceRegistryResponseToDomainObject(data: any): RegistryAgent {
        return RegistryAgent.fromObject({
            id: data.raid,
            registryId: data.registry_id,
            name: data.name,
            keyHash: data.key_hash,
            createdAt: data.created_at,
            createdByUserId: data.created_by_user_id
        });
    }

    public async getAgentById(agentId: number): Promise<RegistryAgent | undefined> {
        return this.#dbApi.get(`/agents/${agentId}`).then(res => this.coerceRegistryResponseToDomainObject(res.data)).catch(err => {
            if (err.response?.data?.code == "REGISTRY_AGENT_NOT_FOUND") {
                return undefined;
            }
            throw new DatabaseError(`Failed to get registry agent by ID`, err);
        })
    }

    public async getAgentByHash(hash: string): Promise<RegistryAgent | undefined> {
        return this.#dbApi.get(`/agents/hash/${hash}`).then(res => this.coerceRegistryResponseToDomainObject(res.data)).catch(err => {
            if (err.response?.data?.code == "REGISTRY_AGENT_NOT_FOUND") {
                return undefined;
            }
            throw new DatabaseError(`Failed to get registry agent by ID`, err);
        })
    }

    public async getAgentsInRegistry(registryId: number): Promise<RegistryAgent[]> {
        return this.#dbApi.get(`/registry/${registryId}/agents`).then(res => {
            return res.data.map((r: any) => this.coerceRegistryResponseToDomainObject(r));
        }).catch(err => {
            throw new DatabaseError(`Failed to get registry agent by ID`, err);
        })
    }

    public async createAgent(registryId: number, name: string, creatorId: number): Promise<RegistryAgent> {
        // name validation
        const nameCandidate = name.trim();
        if (nameCandidate.length > 255 || nameCandidate.length < 1) throw new IllegalArgumentError(`Registry agent name out of bounds`);
        if (!(/^\w+$/.test(nameCandidate))) throw new IllegalArgumentError(`Invalid characters in agent name`);
        // verify name not already in use
        await this.#dbApi.get(`/registry/${registryId}/agents?name=${nameCandidate}`).then(r => { throw new IllegalArgumentError(`Registry agent with name already exists`)})
            .catch(err => {
                if (err instanceof AxiosError && err.status != 404) throw new DatabaseError("Failed to verify the name of the agent", err);
                if (err instanceof AxiosError) return;
                throw err;
            })

        // existence validation
        const registry = await this.#registryLifecycleService.getRegistryById(registryId);
        if (!registry) throw new IllegalArgumentError(`Registry with ID ${registryId} does not exist`);
        const creator = await this.#usersAuthService.getUserById(creatorId);
        if (!creator) throw new IllegalArgumentError(`Creator with ID ${creatorId} does not exist`);

        // create the agent
        const key = await this.getNextAgentKey();
        return this.#dbApi.post(`/registry/${registryId}/agents`, {
            name: nameCandidate,
            key_hash: key,
            created_by_user_id: creatorId
        }).then(res => this.coerceRegistryResponseToDomainObject(res.data))
          .catch(err => {
            throw new DatabaseError(`Failed to create the registry agent`, err);
        })
    }

    public async updateAgentName(agentId: number, name: string): Promise<void> {
        const agent = await this.getAgentById(agentId);
        if (!agent) throw new IllegalArgumentError(`Agent with ID ${agentId} does not exist`);

        // name validation
        const nameCandidate = name.trim();
        if (nameCandidate.length > 255 || nameCandidate.length < 1) throw new IllegalArgumentError(`Registry agent name out of bounds`);
        if (!(/^\w+$/.test(nameCandidate))) throw new IllegalArgumentError(`Invalid characters in agent name`);
        // verify name not already in use
        await this.#dbApi.get(`/registry/${agent.registryId}/agents?name=${nameCandidate}`).then(r => {
            const testAgent = this.coerceRegistryResponseToDomainObject(r.data);
            if (testAgent.id !== agentId) throw new IllegalArgumentError(`Registry agent with name already exists`);
        })
            .catch(err => {
                if (err instanceof AxiosError && err.status != 404) throw new DatabaseError("Failed to verify the name of the agent", err);
                if (err instanceof AxiosError) return;
                throw err;
            })

        // change the name
        await this.#dbApi.put(`/registry/${agent.registryId}/agents/${agentId}`, {
            name: nameCandidate
        }).then(() => { return; })
        .catch(err => { throw new DatabaseError(`Failed to update the registry agent`, err) });
    }

    public async updateAgentHash(agentId: number): Promise<string> {
        const agent = await this.getAgentById(agentId);
        if (!agent) throw new IllegalArgumentError(`Agent with ID ${agentId} does not exist`);
        const key = await this.getNextAgentKey();
        console.log(key);

        // change the key
        await this.#dbApi.put(`/registry/${agent.registryId}/agents/${agentId}`, {
            key_hash: key
        }).then(() => { return; })
        .catch(err => { throw new DatabaseError(`Failed to update the registry agent`, err) });

        return key;
    }

    public async deleteAgent(agentId: number): Promise<void> {
        const agent = await this.getAgentById(agentId);
        if (!agent) return;

        // delete the agent
        await this.#dbApi.delete(`/registry/${agent.registryId}/agents/${agentId}`).catch(err => { throw new DatabaseError(`Failed to delete registry agent`, err); })
    }

}
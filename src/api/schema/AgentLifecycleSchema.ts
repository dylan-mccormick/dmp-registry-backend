import z from "zod";
import { ActorPermissions } from "../../model/ActorPermissions";

export const AgentIdQuerySchema = z.object({
    agentId: z.coerce.number().int().positive()
})

export const CreateAgentSchema = z.object({
    name: z.string().min(1).max(255).regex(/^\w+$/)
})

export const AgentPermissionsSchema = z.object({
    permissions: z.array(z.enum(ActorPermissions))
})
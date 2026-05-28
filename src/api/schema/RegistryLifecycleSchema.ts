import z from "zod";
import { RegistryType } from "../../model/RegistryType";

export const CreateRegistryDetailsSchema = z.object({
    name: z.string().nonempty().max(255).regex(/[a-zA-Z0-9]/),
    type: z.enum(Object.values(RegistryType))
})
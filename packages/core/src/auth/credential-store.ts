import { promises as fs } from "fs";
import path from "path";
import os from "os";
import {
    KeyringAdapter,
    OAuthCredentialStore,
    OAuthCredentials,
    OAuthCredentialsStoreMode
} from "./types.js";

interface CredentialStoreOptions {
    mode?: OAuthCredentialsStoreMode;
    filePath?: string;
    keyringService?: string;
    keyring?: KeyringAdapter;
}

interface SerializedCredentialMap {
    version: 1;
    providers: Record<string, OAuthCredentials>;
}

const DEFAULT_STORE_FILE = path.join(os.homedir(), ".omniagent", "oauth-credentials.json");
const DEFAULT_KEYRING_SERVICE = "OmniAgent OAuth Credentials";

export class FileOAuthCredentialStore implements OAuthCredentialStore {
    private readonly filePath: string;

    constructor(filePath: string = DEFAULT_STORE_FILE) {
        this.filePath = filePath;
    }

    public async load(providerId: string): Promise<OAuthCredentials | null> {
        const data = await this.readAll();
        return data.providers[providerId] || null;
    }

    public async save(providerId: string, credentials: OAuthCredentials): Promise<void> {
        const data = await this.readAll();
        data.providers[providerId] = credentials;
        await this.writeAll(data);
    }

    public async delete(providerId: string): Promise<boolean> {
        const data = await this.readAll();
        const existed = providerId in data.providers;
        if (existed) {
            delete data.providers[providerId];
            await this.writeAll(data);
        }
        return existed;
    }

    public async listProviderIds(): Promise<string[]> {
        const data = await this.readAll();
        return Object.keys(data.providers);
    }

    private async readAll(): Promise<SerializedCredentialMap> {
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw) as SerializedCredentialMap;
            if (!parsed || parsed.version !== 1 || typeof parsed.providers !== "object") {
                return { version: 1, providers: {} };
            }
            return parsed;
        } catch {
            return { version: 1, providers: {} };
        }
    }

    private async writeAll(data: SerializedCredentialMap): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
    }
}

export class KeyringOAuthCredentialStore implements OAuthCredentialStore {
    private readonly service: string;
    private readonly keyring: KeyringAdapter;

    constructor(keyring: KeyringAdapter, service: string = DEFAULT_KEYRING_SERVICE) {
        this.keyring = keyring;
        this.service = service;
    }

    public async load(providerId: string): Promise<OAuthCredentials | null> {
        const raw = await this.keyring.load(this.service, providerId);
        if (!raw) return null;

        try {
            return JSON.parse(raw) as OAuthCredentials;
        } catch {
            return null;
        }
    }

    public async save(providerId: string, credentials: OAuthCredentials): Promise<void> {
        await this.keyring.save(this.service, providerId, JSON.stringify(credentials));
    }

    public async delete(providerId: string): Promise<boolean> {
        return this.keyring.delete(this.service, providerId);
    }

    public async listProviderIds(): Promise<string[]> {
        return [];
    }
}

export class AutoOAuthCredentialStore implements OAuthCredentialStore {
    private readonly fileStore: FileOAuthCredentialStore;
    private readonly keyringStore?: KeyringOAuthCredentialStore;

    constructor(options: CredentialStoreOptions = {}) {
        this.fileStore = new FileOAuthCredentialStore(options.filePath);
        if (options.keyring) {
            this.keyringStore = new KeyringOAuthCredentialStore(options.keyring, options.keyringService);
        }
    }

    public async load(providerId: string): Promise<OAuthCredentials | null> {
        if (this.keyringStore) {
            try {
                const fromKeyring = await this.keyringStore.load(providerId);
                if (fromKeyring) return fromKeyring;
            } catch {
                // fall through
            }
        }

        return this.fileStore.load(providerId);
    }

    public async save(providerId: string, credentials: OAuthCredentials): Promise<void> {
        if (this.keyringStore) {
            try {
                await this.keyringStore.save(providerId, credentials);
                await this.fileStore.delete(providerId);
                return;
            } catch {
                // fall through
            }
        }

        await this.fileStore.save(providerId, credentials);
    }

    public async delete(providerId: string): Promise<boolean> {
        let removed = false;

        if (this.keyringStore) {
            try {
                removed = (await this.keyringStore.delete(providerId)) || removed;
            } catch {
                // fall through
            }
        }

        return (await this.fileStore.delete(providerId)) || removed;
    }

    public async listProviderIds(): Promise<string[]> {
        return this.fileStore.listProviderIds();
    }
}

export function createOAuthCredentialStore(options: CredentialStoreOptions = {}): OAuthCredentialStore {
    const mode = options.mode || "auto";

    if (mode === "file") {
        return new FileOAuthCredentialStore(options.filePath);
    }

    if (mode === "keyring") {
        if (!options.keyring) {
            throw new Error("OAuth store mode 'keyring' requires a keyring adapter.");
        }
        return new KeyringOAuthCredentialStore(options.keyring, options.keyringService);
    }

    return new AutoOAuthCredentialStore(options);
}

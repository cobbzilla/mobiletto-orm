import path from "path";
import { logger, MobilettoConnection, MobilettoMetadata, MobilettoConnectionFunction } from "mobiletto-base";
import {
    FIND_FIRST,
    MobilettoMatchAll,
    MobilettoOrmApplyFunc,
    MobilettoOrmFindOpts,
    MobilettoOrmTypeDef,
    MobilettoOrmSyncError,
    MobilettoOrmNotFoundError,
    MobilettoOrmTypeDefConfig,
    MobilettoOrmObject,
    MobilettoOrmIdArg,
    MobilettoOrmError,
    MobilettoOrmNormalizeFunc,
    MobilettoOrmPredicate,
    MobilettoOrmValidationErrors,
    addError,
    DEFAULT_FIELD_INDEX_LEVELS,
} from "mobiletto-orm-typedef";
import {
    MobilettoOrmMetadata,
    MobilettoOrmObjectInstance,
    MobilettoOrmPurgeOpts,
    MobilettoOrmPurgeResult,
    MobilettoOrmPurgeResults,
    MobilettoOrmRepository,
    MobilettoOrmRepositoryFactory,
    MobilettoOrmStorageResolver,
} from "./types.js";
import {
    findVersion,
    includeRemovedThing,
    MobilettoFoundMarker,
    promiseFindById,
    redactAndApply,
    resolveStorages,
    validateIndexes,
    verifyWrite,
} from "./util.js";
import { search } from "./search.js";

const repo = <T extends MobilettoOrmObject>(
    storages: MobilettoConnection[] | MobilettoOrmStorageResolver,
    typeDefOrConfig: MobilettoOrmTypeDefConfig | MobilettoOrmTypeDef
): MobilettoOrmRepository<T> => {
    const typeDef: MobilettoOrmTypeDef =
        typeDefOrConfig instanceof MobilettoOrmTypeDef ? typeDefOrConfig : new MobilettoOrmTypeDef(typeDefOrConfig);
    const repository: MobilettoOrmRepository<T> = {
        typeDef,
        async validate(thing: T, current?: T): Promise<T> {
            return (await typeDef.validate(thing, current)) as T;
        },
        id(thing: T): string | null {
            return typeDef.id(thing);
        },
        idField(thing: T) {
            return typeDef.idField(thing);
        },
        async create(thing: T): Promise<T> {
            // validate fields
            const obj: T = (await typeDef.validate(thing)) as T;

            // does thing with PK exist? if so, error
            const id = typeDef.id(obj);
            if (!id) {
                throw new MobilettoOrmNotFoundError(typeof obj !== "undefined" ? JSON.stringify(obj) : "undefined");
            }
            const errors: MobilettoOrmValidationErrors = {};
            const found = await repository.safeFindById(id);
            if (found != null) {
                addError(errors, "id", "exists");
            }
            await validateIndexes<T>(this, obj, errors);

            obj._meta = typeDef.newMeta(id);
            return (await verifyWrite(repository, storages, typeDef, id, obj)) as T;
        },
        async update(editedThing: T): Promise<T> {
            const id = typeDef.id(editedThing);
            if (!id) {
                throw new MobilettoOrmSyncError("undefined", "update: error determining id");
            }
            if (!editedThing?._meta?.version) {
                throw new MobilettoOrmError("update: _meta.version is required");
            }

            // does thing with PK exist? if not, error
            const found = await findVersion(repository, id, editedThing?._meta?.version);
            if (!found._meta) {
                throw new MobilettoOrmError("update: findVersion returned object without _meta");
            }

            // validate fields
            const obj: T = (await typeDef.validate(editedThing, found)) as T;
            if (!obj._meta) {
                throw new MobilettoOrmError("update: validate returned object without _meta");
            }
            await validateIndexes<T>(this, obj, {});

            obj._meta.version = typeDef.newVersion();

            const now = Date.now();
            if (typeof obj._meta.ctime !== "number" || obj._meta.ctime < 0) {
                obj._meta.ctime = now;
            }
            if (typeof obj.mtime !== "number" || obj.mtime < obj.ctime) {
                obj._meta.mtime = now;
            }
            const toWrite = Object.assign({}, found, obj);
            return typeDef.redact(await verifyWrite(repository, storages, typeDef, id, toWrite, found)) as T;
        },
        async remove(thingToRemove: MobilettoOrmIdArg): Promise<MobilettoOrmObject> {
            if (typeof thingToRemove === "string" || !thingToRemove?._meta?.version) {
                thingToRemove = await this.findById(thingToRemove);
            }

            // is there a thing that matches current? if not, error
            const found: T = (await findVersion<T>(
                repository,
                typeDef.id(thingToRemove),
                thingToRemove._meta?.version
            )) as T;

            const tombstone = typeDef.tombstone(found);
            return typeDef.redact(
                await verifyWrite(repository, storages, typeDef, typeDef.id(found), tombstone, found)
            ) as MobilettoOrmObject;
        },
        async purge(idVal: MobilettoOrmIdArg, opts?: MobilettoOrmPurgeOpts): Promise<MobilettoOrmPurgeResults> {
            const id = this.resolveId(idVal, "purge");
            const found = await this.findById(id, { removed: true });
            const force = (opts && opts.force === true) || false;
            if (!force && !typeDef.isTombstone(found as T)) {
                throw new MobilettoOrmSyncError(id, `purge(${id}}: object must first be removed`);
            }
            const objPath = typeDef.generalPath(id);
            const deletePromises = [];
            for (const storage of await resolveStorages(storages)) {
                deletePromises.push(
                    new Promise<MobilettoOrmPurgeResult>((resolve, reject) => {
                        storage
                            .remove(objPath, { recursive: true })
                            .then((result: MobilettoOrmPurgeResult) => resolve(result))
                            .catch((e: Error) => {
                                reject(e);
                            });
                    })
                );
            }
            return await Promise.all(deletePromises);
        },
        async safeFindById(id: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts): Promise<T | null> {
            try {
                return await this.findById(id, opts);
            } catch (e) {
                return null;
            }
        },
        async exists(id: MobilettoOrmIdArg): Promise<boolean> {
            return (await this.safeFindById(id)) != null;
        },
        resolveId(id: MobilettoOrmIdArg, ctx?: string): string {
            const resolved =
                typeof id === "object" ? this.id(id as T) : typeof id === "string" && id.length > 0 ? id : null;
            if (!resolved) {
                throw new MobilettoOrmError(`resolveId${ctx ? `[${ctx}]` : ""}: unresolvable id: ${id}`);
            }
            return resolved;
        },
        async findById(idVal: MobilettoOrmIdArg, opts?: MobilettoOrmFindOpts): Promise<T> {
            const id = this.resolveId(idVal, "findById");

            const idPath = !!(opts && opts.idPath && opts.idPath === true);
            const objPath = idPath ? id : typeDef.generalPath(id);
            const listPromises = [];
            const found: Record<string, MobilettoOrmObjectInstance> = {};
            const absent: MobilettoConnection[] = [];
            const removed = !!(opts && opts.removed && opts.removed === true);
            const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();

            // read current version from each storage
            for (const storage of await resolveStorages(storages)) {
                listPromises.push(
                    new Promise<void>((resolve) => {
                        // try {
                        storage.safeList(objPath).then((files: MobilettoMetadata[]) => {
                            if (files && files.length > 0) {
                                files
                                    .filter((f: MobilettoMetadata) => f.name && typeDef.isSpecificPath(f.name))
                                    .sort((f1: MobilettoMetadata, f2: MobilettoMetadata) =>
                                        f1.name.localeCompare(f2.name)
                                    );
                                const mostRecentFile = files[files.length - 1].name;
                                storage
                                    .safeReadFile(mostRecentFile)
                                    .then((data: Buffer | null) => {
                                        if (!data) {
                                            resolve();
                                            return;
                                        }
                                        const object = noRedact
                                            ? JSON.parse(data.toString("utf8"))
                                            : typeDef.redact(JSON.parse(data.toString("utf8")));
                                        if (!includeRemovedThing(removed, object)) {
                                            resolve();
                                            return;
                                        }
                                        found[storage.name] = {
                                            storage,
                                            object,
                                            name: path.basename(mostRecentFile),
                                        };
                                        if (noRedact) {
                                            found[storage.name].data = data;
                                        }
                                        // clean up excess versions
                                        if (files.length > typeDef.maxVersions) {
                                            const removePromises: Promise<string | string[]>[] = [];
                                            files.map((f: MobilettoMetadata) => {
                                                removePromises.push(storage.remove(f.name));
                                            });
                                            Promise.all(removePromises).then((result) => {
                                                if (result) {
                                                    const removed = result.flat(1);
                                                    if (logger.isInfoEnabled()) {
                                                        logger.info(
                                                            `findById(${id}): removed ${removed.length} excess versions`
                                                        );
                                                    }
                                                }
                                            });
                                        }
                                        resolve();
                                    })
                                    .catch((e: Error) => {
                                        if (logger.isErrorEnabled()) {
                                            logger.error(`findById(${id}) error reading ${mostRecentFile}: ${e}`);
                                        }
                                        resolve();
                                    });
                            } else {
                                absent.push(storage);
                                resolve();
                            }
                        });
                    })
                );
            }
            await Promise.all(listPromises);
            if (Object.values(found).length === 0) {
                throw new MobilettoOrmNotFoundError(id);
            }
            const sortedFound = Object.values(found).sort((f1, f2) =>
                f1.name && f2.name ? f1.name.localeCompare(f2.name) : 0
            );

            // sync: update older/missing versions to the newest version
            const newest = sortedFound[sortedFound.length - 1];
            const newestObj = newest.object;
            const newestJson = JSON.stringify(newestObj);
            const newestPath = typeDef.specificPath(newestObj);
            const syncPromises = [];
            for (let i = 0; i < sortedFound.length - 1; i++) {
                const f = sortedFound[i];
                if (newestJson !== JSON.stringify(f.object)) {
                    syncPromises.push(
                        new Promise((resolve) => {
                            try {
                                resolve(f.storage.writeFile(newestPath, newestJson));
                            } catch (e) {
                                if (logger.isWarnEnabled()) {
                                    logger.warn(
                                        `findById: storage[${f.storage.name}].writeFile(${newestPath}) failed: ${e}`
                                    );
                                }
                                resolve(e);
                            }
                        })
                    );
                }
            }
            for (const missing of absent) {
                syncPromises.push(
                    new Promise<number | void>((resolve) => {
                        try {
                            resolve(missing.writeFile(newestPath, newestJson));
                        } catch (e) {
                            if (logger.isWarnEnabled()) {
                                logger.warn(`findById: storage[${missing.name}].writeFile(${newestPath}) failed: ${e}`);
                            }
                            resolve();
                        }
                    })
                );
            }
            try {
                await Promise.all(syncPromises);
            } catch (e) {
                if (logger.isWarnEnabled()) {
                    logger.warn(`findById: error resolving syncPromises: ${e}`);
                }
            }
            return (noRedact ? newestObj : typeDef.redact(newestObj)) as T;
        },
        async find(opts: MobilettoOrmFindOpts): Promise<T[]> {
            const predicate = opts && opts.predicate ? opts.predicate : null;
            if (!predicate) {
                throw new MobilettoOrmError(`find: opts.predicate is required`);
            }

            const searchPath = typeDef.typePath() + (opts && opts.idPath ? opts.idPath : "");
            const removed = !!(opts && opts.removed && opts.removed === true);
            const noRedact = !!(opts && opts.noRedact && opts.noRedact === true) || !typeDef.hasRedactions();
            const noCollect = !!(opts && opts.noCollect && opts.noCollect === true) || false;
            const promises: Promise<void>[] = [];
            const foundByHash: Record<string, T | null> = {};
            const foundById: Record<string, T | null> = {};

            // read all things concurrently
            for (const storage of await resolveStorages(storages)) {
                promises.push(
                    search(
                        repository,
                        storage,
                        searchPath,
                        removed,
                        noRedact,
                        noCollect,
                        predicate,
                        opts,
                        promises,
                        foundByHash,
                        foundById
                    )
                );
            }
            await Promise.all(promises);
            const resolved = await Promise.all(promises);
            if (resolved.length !== promises.length) {
                if (logger.isWarnEnabled()) {
                    logger.warn(`find: ${resolved} of ${promises.length} promises resolved`);
                }
            }
            return Object.values(foundById).filter((f) => f != null) as T[];
        },
        async count(predicate: MobilettoOrmPredicate): Promise<number> {
            return (await this.find({ predicate })).length;
        },
        async findBy(
            field: string,
            /* eslint-disable @typescript-eslint/no-explicit-any */
            value: any,
            /* eslint-enable @typescript-eslint/no-explicit-any */
            opts?: MobilettoOrmFindOpts
        ): Promise<T | T[] | null> {
            const compValue =
                typeDef.fields &&
                typeDef.fields[field] &&
                value &&
                typeof typeDef.fields[field].normalize === "function"
                    ? await (typeDef.fields[field].normalize as MobilettoOrmNormalizeFunc)(value)
                    : value;
            const idxPath: string = typeDef.indexPath(field, compValue);
            const first = !!(opts && typeof opts.first === "boolean" && opts.first);
            const removed = !!(opts && opts.removed && opts.removed);
            const noRedact = !!(opts && opts.noRedact && opts.noRedact) || !typeDef.hasRedactions();
            const noCollect = !!(opts && opts.noCollect && opts.noCollect) || false;
            const predicate: MobilettoOrmPredicate | null =
                opts && typeof opts.predicate === "function" ? opts.predicate : null;
            const apply: MobilettoOrmApplyFunc | null = opts && typeof opts.apply === "function" ? opts.apply : null;
            const applyResults: Record<string, unknown> | null =
                opts && typeof opts.applyResults === "object" ? opts.applyResults : null;

            if (typeDef.primary && field === typeDef.primary) {
                const foundById = (await this.findById(compValue, opts)) as T;
                if (!removed && typeDef.isTombstone(foundById)) {
                    return first ? null : [];
                }
                if (predicate && !predicate(foundById)) {
                    return first ? null : [];
                }
                const maybeRedacted: T = await redactAndApply<T>(typeDef, foundById, opts);
                return first ? maybeRedacted : [maybeRedacted];
            }

            // read all things concurrently
            const storagePromises: Promise<string>[] = [];
            const found: Record<string, T | null> = {};
            const addedAnything: MobilettoFoundMarker = { found: false };
            for (const storage of await resolveStorages(storages)) {
                const logPrefix = `[1] storage(${storage.name}):`;
                if (first && addedAnything.found) {
                    break;
                }
                storagePromises.push(
                    new Promise<string>((resolve) => {
                        if (first && addedAnything.found) {
                            resolve(`[1] storage(${storage.name}): already found, resolving`);
                        } else {
                            const indexLevels = typeDef.fields[field].indexLevels || DEFAULT_FIELD_INDEX_LEVELS;
                            storage
                                .safeList(idxPath, { recursive: indexLevels > 0 })
                                .then((indexEntries: MobilettoMetadata[]) => {
                                    const findByIdPromises: Promise<string>[] = [];
                                    for (const entry of indexEntries) {
                                        if (first && addedAnything.found) {
                                            resolve(`${logPrefix} (after listing) already found, resolving`);
                                            break;
                                        }
                                        const id = typeDef.idFromPath(entry.name);
                                        if (typeof found[id] === "undefined") {
                                            found[id] = null;
                                            findByIdPromises.push(
                                                promiseFindById(
                                                    repository,
                                                    storage,
                                                    field,
                                                    value,
                                                    id,
                                                    first,
                                                    removed,
                                                    noRedact,
                                                    predicate,
                                                    apply,
                                                    applyResults,
                                                    noCollect,
                                                    found,
                                                    addedAnything
                                                )
                                            );
                                        }
                                    }
                                    Promise.all(findByIdPromises)
                                        .then(() => {
                                            resolve(
                                                `${logPrefix} resolved ${
                                                    findByIdPromises.length
                                                } findByIdPromises: ${JSON.stringify(findByIdPromises)}`
                                            );
                                        })
                                        .catch((findErr: Error) => {
                                            `${logPrefix} error resolving ${findByIdPromises.length} findByIdPromises: ${findErr}`;
                                        });
                                })
                                .catch((e: Error) => {
                                    if (logger.isWarnEnabled()) {
                                        logger.warn(`findBy(${field}, ${value}) error: ${e}`);
                                    }
                                    resolve(`${logPrefix} Resolving to error: ${e}`);
                                });
                        }
                    })
                );
            }
            const results = await Promise.all(storagePromises);
            logger.info(`findBy promise results = ${JSON.stringify(results)}`);
            const foundValues: T[] = Object.values(found).filter((v) => v != null) as T[];
            if (first) {
                return foundValues.length > 0 ? foundValues[0] : null;
            }
            return foundValues;
        },
        async safeFindBy(
            field: string,
            /* eslint-disable @typescript-eslint/no-explicit-any */
            value: any,
            /* eslint-enable @typescript-eslint/no-explicit-any */
            opts?: MobilettoOrmFindOpts
        ): Promise<T | T[] | null> {
            const first = (opts && typeof opts.first && opts.first === true) || false;
            try {
                return await this.findBy(field, value, opts);
            } catch (e) {
                if (logger.isWarnEnabled()) {
                    logger.warn(`safeFindBy(${field}) threw ${e}`);
                }
                return first ? null : [];
            }
        },
        async safeFindFirstBy(
            field: string,
            /* eslint-disable @typescript-eslint/no-explicit-any */
            value: any,
            /* eslint-enable @typescript-eslint/no-explicit-any */
            opts?: MobilettoOrmFindOpts
        ): Promise<T | null> {
            try {
                const found = await this.safeFindBy(field, value, Object.assign({}, FIND_FIRST, opts || {}));
                return found ? (found as T) : null;
            } catch (e) {
                if (logger.isWarnEnabled()) {
                    logger.warn(`safeFindBy(${field}) threw ${e}`);
                }
                return null;
            }
        },
        async existsWith(field: string, value: any): Promise<boolean> {
            const found = await this.safeFindBy(field, value);
            return (
                found != null &&
                ((Array.isArray(found) && found.length > 0) || (!Array.isArray(found) && typeof found === "object"))
            );
        },
        async findVersionsById(id: MobilettoOrmIdArg): Promise<Record<string, MobilettoOrmMetadata[]>> {
            const objPath = typeDef.generalPath(id);
            const storagePromises: Promise<void>[] = [];
            const found: Record<string, MobilettoMetadata[]> = {};

            // read current version from each storage
            for (const storage of await resolveStorages(storages)) {
                storagePromises.push(
                    new Promise<void>((resolve, reject) => {
                        storage
                            .safeList(objPath)
                            .then((files: MobilettoMetadata[]) => {
                                const dataPromises: Promise<MobilettoMetadata>[] = [];
                                if (!files || files.length === 0) {
                                    resolve();
                                } else {
                                    files
                                        .filter((f: MobilettoMetadata) => f.name && typeDef.isSpecificPath(f.name))
                                        .sort((f1: MobilettoMetadata, f2: MobilettoMetadata) =>
                                            f1.name.localeCompare(f2.name)
                                        )
                                        .map((f: MobilettoOrmMetadata) => {
                                            dataPromises.push(
                                                new Promise<MobilettoOrmMetadata>((resolve2, reject2) => {
                                                    storage
                                                        .safeReadFile(f.name)
                                                        .then((data: Buffer | null) => {
                                                            if (!data) {
                                                                reject2(
                                                                    new MobilettoOrmError(
                                                                        `findVersionsById(${id}): safeReadFile error, no data`
                                                                    )
                                                                );
                                                            }
                                                            if (!typeDef.hasRedactions()) {
                                                                f.data = data || undefined;
                                                            }
                                                            f.object = data
                                                                ? typeDef.redact(JSON.parse(data.toString("utf8")))
                                                                : undefined;
                                                            resolve2(f);
                                                        })
                                                        .catch((e2: Error) => {
                                                            if (logger.isWarnEnabled()) {
                                                                logger.warn(
                                                                    `findVersionsById(${id}): safeReadFile error ${e2}`
                                                                );
                                                            }
                                                            reject2(e2);
                                                        });
                                                })
                                            );
                                        });
                                    Promise.all(dataPromises)
                                        .then(() => {
                                            found[storage.name] = files;
                                            resolve();
                                        })
                                        .catch((e: Error) => {
                                            reject(e);
                                        });
                                }
                            })
                            .catch((e: Error) => {
                                if (logger.isErrorEnabled()) {
                                    logger.error(`findVersionsById(${id}): ${e}`);
                                }
                                reject(e);
                            });
                    })
                );
            }
            await Promise.all(storagePromises);
            return found;
        },
        async findAll(opts?: MobilettoOrmFindOpts): Promise<T[]> {
            return repository.find(Object.assign({ predicate: MobilettoMatchAll }, opts || {}));
        },
        async findAllIncludingRemoved(): Promise<T[]> {
            return repository.find({ predicate: MobilettoMatchAll, removed: true });
        },
        async findSingleton(): Promise<T> {
            if (!typeDef.singleton) {
                throw new MobilettoOrmError(`findSingleton: typeDef ${typeDef.typeName} is not a singleton type`);
            }
            return repository.findById(typeDef.singleton);
        },
    };
    return repository;
};

export const repositoryFactory = (
    storages: MobilettoConnection[] | MobilettoOrmStorageResolver
): MobilettoOrmRepositoryFactory => {
    return {
        storages,
        repository: <T extends MobilettoOrmObject>(typeDef: MobilettoOrmTypeDefConfig | MobilettoOrmTypeDef) =>
            repo<T>(storages, typeDef),
    };
};

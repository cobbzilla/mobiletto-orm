import { logger, M_DIR, MobilettoMetadata } from "mobiletto-base";
import { MobilettoOrmObject, OBJ_DIR_SUFFIX } from "mobiletto-orm-typedef";
import { includeRemovedThing, redactAndApply } from "./util.js";
import { MobilettoOrmFindOpts, MobilettoOrmPredicate, MobilettoOrmRepository } from "./types.js";

export const search = async <T extends MobilettoOrmObject>(
    repository: MobilettoOrmRepository<T>,
    storage: MobilettoOrmObject,
    searchPath: string,
    removed: boolean,
    noRedact: boolean,
    noCollect: boolean,
    predicate: MobilettoOrmPredicate,
    opts: MobilettoOrmFindOpts,
    promises: Promise<void>[],
    foundByHash: Record<string, T | null>,
    foundById: Record<string, T | null>
) => {
    const typeDef = repository.typeDef;
    return new Promise<void>((resolve) => {
        storage
            .safeList(searchPath, { recursive: typeDef.indexLevels > 0 })
            .then((listing: MobilettoMetadata[] | null) => {
                if (!listing || listing.length === 0) {
                    resolve();
                }
                const dirList: MobilettoMetadata[] = (listing as MobilettoMetadata[]).filter((m) => m.type === M_DIR);
                const objList: MobilettoMetadata[] = dirList.filter((m) => m.name.endsWith(OBJ_DIR_SUFFIX));
                if (objList.length === 0) {
                    if (dirList.length > 0) {
                        const nestedPromises: Promise<void>[] = [];
                        for (const dir of dirList) {
                            nestedPromises.push(
                                search(
                                    repository,
                                    storage,
                                    dir.name,
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
                        Promise.all(nestedPromises)
                            .then(() => {
                                resolve();
                            })
                            .catch((e4: Error) => {
                                if (logger.isWarnEnabled()) {
                                    logger.warn(`find: ${e4}`);
                                }
                                resolve();
                            });
                    } else {
                        resolve();
                    }
                } else {
                    const findByIdPromises: Promise<void>[] = [];
                    for (const dir of objList) {
                        // find the latest version of each distinct thing
                        const idHash: string = dir.name;
                        if (typeof foundByHash[idHash] === "undefined") {
                            foundByHash[idHash] = null;
                            findByIdPromises.push(
                                new Promise<void>((resolve2) => {
                                    repository
                                        .findById(idHash, { removed, noRedact, idPath: true })
                                        .then((thing) => {
                                            // does the thing match the predicate? if so, include in results
                                            // removed things are only included if opts.removed was set
                                            if (thing) {
                                                const obj = thing as T;
                                                if (predicate(obj) && includeRemovedThing(removed, obj)) {
                                                    redactAndApply<T>(typeDef, obj, opts)
                                                        .then((maybeRedacted: T) => {
                                                            if (!noCollect) {
                                                                foundByHash[idHash] = foundById[
                                                                    typeDef.id(maybeRedacted)
                                                                ] = maybeRedacted;
                                                            }
                                                            resolve2();
                                                        })
                                                        .catch((e4: Error) => {
                                                            if (logger.isWarnEnabled()) {
                                                                logger.warn(`find: findById(${idHash}): ${e4}`);
                                                            }
                                                            resolve2();
                                                        });
                                                }
                                            } else {
                                                resolve2();
                                            }
                                        })
                                        .catch((e3: Error) => {
                                            if (logger.isWarnEnabled()) {
                                                logger.warn(`find: findById(${idHash}): ${e3}`);
                                            }
                                            resolve2();
                                        });
                                })
                            );
                        }
                    }
                    Promise.all(findByIdPromises)
                        .then(() => {
                            resolve();
                        })
                        .catch((e4: Error) => {
                            if (logger.isWarnEnabled()) {
                                logger.warn(`find: ${e4}`);
                            }
                            resolve();
                        });
                }
            })
            .catch((e2: Error) => {
                if (logger.isWarnEnabled()) {
                    logger.warn(`find: safeList(${searchPath}): ${e2}`);
                }
                resolve();
            });
    });
};

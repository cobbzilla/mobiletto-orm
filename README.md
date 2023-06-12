mobiletto-orm
=============
A simple object-relational mapper (ORM) for [mobiletto](https://www.npmjs.com/package/mobiletto)
storage.

Mobiletto supports connections to Amazon S3, Backblaze B2, and local filesystems.

# Contents
* [Source](#Source)
* [Support and Funding](#Support-and-Funding)
* [Installation and usage](#Installation-and-usage)
    * [npm package](#npm-package)
    * [From source](#From-source)
* [Quick Start](#Quick-Start)
* [repositoryFactory](#repositoryFactory)
* [Type Definitions](#Type-Definitions)
  * [Type Name](#Type-Name) 
  * [Fields](#Fields)
  * [Optional Type Parameters](#Optional-Type-Parameters)
    * [Base Path](#Base-Path)
    * [Max Versions](#Max-Versions)
* [Caveats](#Caveats)
  * [id Field](#id-field)


### Source
* [mobiletto-orm on GitHub](https://github.com/cobbzilla/mobiletto-orm)
* [mobiletto-orm on npm](https://www.npmjs.com/package/mobiletto-orm)

## Support and Funding
I would be sincerely grateful for any [contribution via Patreon](https://www.patreon.com/cobbzilla)

## Installation and usage
You can install `mobiletto-orm` via npm or yarn

### npm package

    # install with npm
    npm i mobiletto-orm

    # install with yarn
    yarn add mobiletto-orm

### From source
To access the mobiletto-orm source:

    # Clone source and install dependencies
    git clone https://github.com/cobbzilla/mobiletto-orm.git
    cd mobiletto-orm
    yarn install

## Quick Start

    const orm = require('mobiletto-orm')

    # How to create mobiletto connections: https://github.com/cobbzilla/mobiletto/blob/master/README.md#Basic-usage
    const mobilettoConnections = [ ...array of connections... ]

    # Objects and indexes will be replicated across all mobiletto connections
    const factory = orm.repositoryFactory(mobilettoConnections)

    # Objects are stored in type-specific repositories
    # A repository is backed by a directory on each mobiletto connection
    const repository = factory.repository({
        typeName: 'Account',
        fields: {
            username: {
                required: true,        # field is required
                min: 5,                # min 5 chars
                max: 100,              # max 100 chars
                regex: /[A-Z\d+]+/gi,  # validate against a regex
                index: true,           # enable findBy('username', someUsername)
                updatable: false       # updates will be silently ignored
            },
            email: {
                required: true,        # field is required
                min: 8,                # min 8 chars
                max: 100,              # max 100 chars
                # a reasonable email regex
                regex: /^[A-Z\d][A-Z\d._%+-]*@[A-Z\d.-]+\.[A-Z]{2,6}$/gi,
                index: true            # enable findBy('email', someEmailAddress)
            },
            bio: {
                max: 1000              # max 1000 chars (field is optional)
            },
            yearJoined: {
                minValue: 2023         # minimum numeric value
                maxValue: 2123         # maxmimum numeric value
            }
        }
    })

    const username = 'some_username'
    const email = 'jimmy@example.com'

    # Every object has a unique 'id' field that is always required and must be unique
    # For our Account type, we use the username field as the id
    # If an object with the same 'id' already exists, a MobilettoOrmValidationError will be thrown
    # If a race condition is detected (simultaneous create), a MobilettoOrmSyncError will be throw
    const newUser = repository.create({
        id: username,
        username: username,
        email: email,
        password: 'some_hashed_password'
    })

    # Find by username. This works because the field has 'index: true'
    const foundByUsername = repository.findBy('username', username)

    # Find by email. This works because the field has 'index: true'
    const foundByEmail = repository.findBy('email', email)

    # Find all accounts
    const everyone = repository.findAll()

    # Find all accounts, even removed ones
    const everyone = repository.findAllIncludingRemoved()

    # Find by arbitrary predicate
    const matches = repository.find(obj => functionThatReturnsTrueIfObjectMatches(obj))

    # Find by arbitrary predicate, including removed objects
    const matchesIncludingRemoved = repository.find(obj => predicate(obj), { removed: true })

    # When creating changes, you must always specify the 'id' of the object to update
    # Any other changes are optional
    const changes = {
      id: username,
      bio: 'this is my biography'
    }

    # When calling 'update' you must supply the previous version, this helps avoid race conditions
    # If a race condition is detected (simultaneous changes), a MobilettoOrmSyncError will be throw
    const updatedUser = repository.update(changes, newUser.version)

    # When calling 'remove' you must supply the previous version, this helps avoid race conditions
    # If a race condition is detected (simultaneous changes), a MobilettoOrmSyncError will be throw
    # The tombstone retains the object ID, ctime 
    const tombstone = repository.remove(username, updatedUser.version)

## repositoryFactory
The `repositoryFactory` function is the way to start working with mobiletto-orm

If you're unfamiliar with [how to create mobiletto connections](https://github.com/cobbzilla/mobiletto/blob/master/README.md#Basic-usage),
now is a great time to read up. It's fairly simple.

When you create a `repositoryFactory`, you pass an array of mobiletto connections.

## Type Definitions

### Type Name
The `typeName` property is a string that designates the name of the type.

Type names must be globally unique within your app.

Type names cannot contain the `%` or `~` characters.

### Fields
Every type has some built-in fields:
* id: the primary key, a unique identifier for each instance of the type
* ctime: the creation time: initialized when the object is created, never updated thereafter
* mtime: the modification time: initialized when the object is created, updated upon every change (update or remove)
* version: a unique string that identifies the particular version of the object represented by the 'id'

Within a type definition object that you might pass to the repository function, the `fields` property
is a JSON object, where the keys are the field names, and the values are objects that describes that
field's configuration.

The simplest field declaration is

    myAnythingField: {}

This allows anything to be stored in the field. The field can also be omitted or set to null.

The next simplest field declaration is:

    myRequiredField: { required: true } 

This creates a field that is required. Calls to `create` or `update` where the object passed in
does not define this field (or where the field's value is null or the empty string), then a validation
error (of type MobilettoOrmValidationError) will be thrown back to the caller.

Other field configuration properties are outlined below:

    myExampleField: {
        # this field can only be set upon creation
        # updates to this field will be silently ignored
        updatable: false

        # when creating a new object, use this default value if myExampleField is empty
        default: 'Some-Default-Value'
    }

    myExampleStringField: {
        min: 10,             # minimum string length of 10 characters
        max: 200,            # maximum string length of 200 characters
        regex: /^[A-Z]+$/gi  # values must match this regex
    }

    myExampleNumberField: {
        minValue: 100,       # value must be greater than or equal to this minimum numeric value
        max: 1000,           # value must be less than or equal to this maximum numeric value
        regex: /^[\d]+$/gi   # values must match this regex
    }

### Optional Type Parameters
These type definition properties are optional.

#### Base Path
The `basePath` property specifies a directory prefix when writing to the mobiletto connections.

The default `basePath` is `''` (no prefix).

#### Max Versions
The `maxVersions` property specifies how many (most recent) versions of an object will be retained.

Older versions are deleted. The default `maxVersions` is 5.

## Caveats

### id Field
Whatever value you put into the `id` field becomes part of the underlying filename to the JSON representation
of the object. This means that the ultimate value of the `id` field must be coerced into a filesystem-friendly name.

mobiletto-orm coerces `id` values using: `encodeURIComponent(id).replaceAll('%', '~')`

This invocation ensures that repeated invocations yield the same result.

**Because of a subtle collision risk if your `id` values contain literal `%` and `~` characters,
these characters are not allowed in `id` values**

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
* [Mobiletto Storage Drivers](#Mobiletto-Storage-Drivers)
* [Quick Start](#Quick-Start)
* [repositoryFactory](#repositoryFactory)
* [Type Definitions](#Type-Definitions)
  * [Type Name](#Type-Name) 
  * [Fields](#Fields)
    * [Field Types](#Field-Types)
    * [Field Controls](#Field-Controls)
  * [Optional Type Parameters](#Optional-Type-Parameters)
    * [Base Path](#Base-Path)
    * [Max Versions](#Max-Versions)
    * [Min Writes](#Min-Writes)
    * [Alternate IDs](#Alternate-IDs)
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

## Mobiletto Storage Drivers
mobiletto-orm depends on [mobiletto-base](https://github.com/cobbzilla/mobiletto-base),
which does not include any storage drivers.

To enable a particular storage driver, first add the dependency to your project:

    # Use npm to install the storage driver(s) that you will need 
    npm i mobiletto-driver-s3
    npm i mobiletto-driver-b2
    npm i mobiletto-driver-local
    npm i mobiletto-driver-indexeddb

    # Or, use yarn to install the storage driver(s) that you will need
    yarn add mobiletto-driver-s3
    yarn add mobiletto-driver-b2
    yarn add mobiletto-driver-local
    yarn add mobiletto-driver-indexeddb

In your code, before using mobiletto to connect to storage, register the driver:

    const { registerDriver } = require('mobiletto-base')
    registerDriver('s3', require('mobiletto-driver-s3'))
    registerDriver('b2', require('mobiletto-driver-b2'))
    registerDriver('local', require('mobiletto-driver-local'))
    registerDriver('indexeddb', require('mobiletto-driver-indexeddb'))

## Quick Start

    const orm = require('mobiletto-orm')

    // Register mobiletto storage drivers (described above)

    // How to create mobiletto connections: https://github.com/cobbzilla/mobiletto/blob/master/README.md#Basic-usage
    const conns = [ ...array of connections... ]

    // Objects and indexes will be replicated across all mobiletto connections
    // The 'conns' parameter below could also be an async function that returns an array of connections
    const factory = orm.repositoryFactory(conns)

    // Objects are stored in type-specific repositories
    // A repository is backed by a directory on each mobiletto connection
    const repository = factory.repository({
        typeName: 'Account',
        fields: {
            username: {
                required: true,        // field is required
                min: 5,                // min 5 chars
                max: 100,              // max 100 chars
                regex: /[A-Z\d+]+/gi,  // validate against a regex
                index: true,           // enable findBy('username', someUsername)
                updatable: false       // updates will be silently ignored
            },
            email: {
                required: true,        // field is required
                min: 8,                // min 8 chars
                max: 100,              // max 100 chars
                // a reasonable email regex
                regex: /^[A-Z\d][A-Z\d._%+-]*@[A-Z\d.-]+\.[A-Z]{2,6}$/gi,
                index: true            // enable findBy('email', someEmailAddress)
            },
            bio: {
                max: 1000              // max 1000 chars (field is optional)
            },
            yearJoined: {
                minValue: 2023         // minimum numeric value
                maxValue: 2123         // maxmimum numeric value
            }
        }
    })

    const username = 'some_username'
    const email = 'jimmy@example.com'

    // Every object has a unique 'id' field that is always required and must be unique
    // However, if typeDef supports alternateID (default enables) you can use 'username' or 'email' as the 'id'
    // See Alternate IDs below for more info
    // If an object with the same id already exists, a MobilettoOrmValidationError will be thrown
    // If a race condition is detected (simultaneous create), a MobilettoOrmSyncError will be throw
    const newUser = repository.create({
        username: username,
        email: email,
        password: 'some_hashed_password'
    })

    // Find by username. This works because the field has 'index: true'
    const foundByUsername = repository.findBy('username', username)

    // Find by email. This works because the field has 'index: true'
    const foundByEmail = repository.findBy('email', email)

    // Find all accounts
    const everyone = repository.findAll()

    // Find all accounts, even removed ones
    const everyone = repository.findAllIncludingRemoved()

    // Find by arbitrary predicate
    const matches = repository.find(obj => functionThatReturnsTrueIfObjectMatches(obj))

    // Find by arbitrary predicate, including removed objects
    const matchesIncludingRemoved = repository.find(obj => predicate(obj), { removed: true })

    // When creating changes, you must always specify the 'id' of the object to update
    // But alternate IDs (see below) will be used if present
    // Any other changes are optional
    const changes = {
      username,
      bio: 'this is my biography'
    }

    // When calling 'update' you must supply the previous version, this helps avoid race conditions
    // If a race condition is detected (simultaneous changes), a MobilettoOrmSyncError will be throw
    const updatedUser = repository.update(changes, newUser.version)

    // When calling 'remove' you must supply the previous version, this helps avoid race conditions
    // If a race condition is detected (simultaneous changes), a MobilettoOrmSyncError will be throw
    // The tombstone retains the object ID, ctime
    const tombstone = repository.remove(username, updatedUser.version)

    // Call 'purge' to clean up all the files. You must call 'remove' before calling 'purge'
    // The following are all equivalent statements. Note that in our example, username was the
    // object ID, and is thus also the tombstone id
    const purged1 = repository.purge(tombstone)
    const purged2 = repository.purge(tombstone.id)
    const purged3 = repository.purge(username)

## repositoryFactory
The `repositoryFactory` function is the way to start working with mobiletto-orm

If you're unfamiliar with [how to create mobiletto connections](https://github.com/cobbzilla/mobiletto/blob/master/README.md#Basic-usage),
now is a great time to read up. It's fairly simple.

When you create a `repositoryFactory`, you pass an array of mobiletto connections, or an async function that
returns a Promise that resolves to an array of mobiletto connections.

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
* type: the data type of the field; if not set explicitly, it will be implied (see [Field Types](#Field-Types)) 

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
        updatable: false,

        # the type of the field
        # valid values are: 'string', 'number', 'boolean', 'array', 'object'
        # incorrectly-typed values result in a validation errors
        type: 'string',

        # restrict to a specific set of values
        # caveat: because this field doesn't define `required: true`, a null value is also valid
        values: ['Some-Default-Value', 'foo', 'bar'],

        # a separate set of labels to use, when presenting the above values in a user interface
        # if not defined, the `value` array will be used
        labels: ['the default thing', 'the foo thing', 'the bar thing'],

        # Instead of the above separate `values` and `labels` arrays, use a single `items` array
        items: [
          { value: 'Some-Default-Value', label: 'the default thing'},
          { value: 'foo',                label: 'the foo thing'},
          { value: 'bar',                label: 'the bar thing'}
        ]

        # when creating a new object, use this default value if myExampleField is empty
        default: 'Some-Default-Value'
    }

    myExampleStringField: {
        control: 'password', # in a user interface, use a password field (do not show the value)
        min: 10,             # minimum string length of 10 characters
        max: 200,            # maximum string length of 200 characters
        regex: /^[A-Z]+$/gi  # values must match this regex
    }

    myExampleNumberField: {
        minValue: 100,       # value must be greater than or equal to this minimum numeric value
        max: 1000,           # value must be less than or equal to this maximum numeric value
        regex: /^[\d]+$/gi   # values must match this regex
    }

    myMultivaluedField: {
        # value must be an array of these values
        # note: if required is false/undefined, then an empty or null array is also valid
        multi: ['apple', 'banana', 'peach', 'plum', 'eggplant', 'squash', 'durian', 'pear']
    }

#### Field Types
The `type` property of a field definition determines what values are allowed when calling `create` or `update`.

The `type` can be `string`, `number`, `boolean`, `array`, or `object`

The `id` property always has a `type` of `string`

You usually don't have to set the `type` on a field, because it can be implied:

 * If the field has a `min`, `max` or `regex` property, the field's implied `type` is `string`
 * If the field has a `minValue` or `maxValue` property, the field's implied `type` is `number`
 * If the field has a `default` value, the field's implied `type` will be the type of the `default` value
 * If the field has a `values` array of valid values, the field's implied `type` will be the type of the first element in the array
 * If the field doesn't have an explicit `type` and none of the above applies, the field's type will be `string`

#### Field Controls
The `control` field is a suggestion to other code about what kind of user-interface control would be best
to set the value for this field.

The `control` can be:
 * `text`: a text box. the default value if nothing more specific can be determined
 * `password`: a text box that does not show its contents to the user
 * `label`: a read-only display view of the value
 * `textarea`: a larger text editing area
 * `select`: select one item from a list
 * `multi`: multi-select 1+ items from a list
 * `flag`: a yes/no value
 * `hidden`: do not show this field at all in a user interface
 * `system`: do not show this field at all in a user interface, even to admins/superusers

If no `control` is set on a field, the default `control` is:

  * If the field's type is `boolean`, then the `control` is `flag`
  * If the field has a `multi` array, then the `control` is `multi`
  * If the field has a `values` array, then the `control` is `select` (for example a single-selection drop-down)
  * If the field's name is `password`, then the `control` is `password`
  * If nothing else matches, then the `control` is `text`

### Optional Type Parameters
These type definition properties are optional.

#### Base Path
The `basePath` property specifies a directory prefix when writing to the mobiletto connections.

The default `basePath` is `''` (no prefix).

#### Max Versions
The `maxVersions` property specifies how many (most recent) versions of an object will be retained.

Older versions are deleted. The default `maxVersions` is 5.

#### Min Writes
The `minWrites` property specifies how many of the underlying storage must have a successful write
to consider a create/update operation a success.

If fewer than this many writes succeed, the entire operation fails and any successful writes are deleted.

The default value is 0, which means that *all* writes must succeed. Set to 1 and only a single write must succeed.

#### Alternate IDs
The `alternateIdFields` property is an array of strings. If an object is passed to `create` or `update` and
does not have an `id` field, but does have one of these fields, then the first field that has a non-empty
string value will be used as the `id`.

The default set of `alternateIdFields` is: `['name', 'username', 'email']`

If you prefer that a particular TypeDef should always require an explicitly set `id`, then
set `alternateIdFields` to `[]` or `null` on your type definition object.

## Caveats

### typeName and id Field
The name of the type, given by `typeName`, and whatever value the `id` field holds will become part of the
underlying filename to the JSON representation of the object.

This means that the `typeName` and the `id` field must be coerced into a filesystem-friendly names.

mobiletto-orm coerces these values using: `encodeURIComponent(id).replaceAll('%', '~')`

This invocation ensures that repeated invocations yield the same result.

**Because of a subtle collision risk if `typeName` or `id` value contains a literal `%` or `~` character,
these characters are not allowed in `typeName` or `id` values**

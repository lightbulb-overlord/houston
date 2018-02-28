import Houston from '../imports/houston';

const require_admin = func => function() { if (Houston._user_is_admin(this.userId)) { return func.apply(this, arguments); } };

Houston.methods = function(collection, raw_methods) {
  const collection_name = collection.name || collection._name || collection;
  const method_names = _(raw_methods).keys();
  Houston._collections.collections.update({name: collection_name}, {$set: {method_names}});

  const methods = {};
  _.each(raw_methods, (func, func_name) => {
    methods[Houston._custom_method_name(collection_name, func_name)] = require_admin(func);
  });

  return Meteor.methods(methods);
};

Houston._setup_collection_methods = function(collection) {
  const name = collection._name;
  const methods = {};
  methods[Houston._houstonize(`${name}_insert`)] = require_admin(function(doc) {
    check(doc, Object);
    return collection.insert(doc);
  });

  methods[Houston._houstonize(`${name}_update`)] = require_admin(function(id, update_dict) {
    check(id, Match.Any);
    check(update_dict, Object);
    if (collection.findOne(id)) {
      collection.update(id, update_dict);
    } else {
      id = collection.findOne(new Meteor.Collection.ObjectID(id));
      collection.update(id, update_dict);
    }

    return `${collection._name} ${id} saved successfully`;
  });

  methods[Houston._houstonize(`${name}_delete`)] = require_admin(function(id) {
    check(id, Match.Any);
    if (collection.findOne(id)) {
      return collection.remove(id);
    } else {
      id = collection.findOne(new Meteor.Collection.ObjectID(id));
      return collection.remove(id);
    }
  });

  methods[Houston._houstonize(`${name}_deleteAll`)] = require_admin(() => collection.remove({}));

  return Meteor.methods(methods);
};

Meteor.methods({
  _houston_make_admin(user_id) {
    check(user_id, String);
    // limit one admin
    if (Houston._admins.findOne({'user_id': {$exists: true}})) { return; }
    Houston._admins.insert({ user_id }); // TODO: verify if this is still necesary since we are using Roles now
    Houston._admins.insert({ exists: true });
    Roles.addUsersToRoles(user_id, ['admin']);
    sync_collections(); // reloads collections in case of new app
    return true;
  },
  _houston_create_user({ username, email, password, roles }) {
    check(username, String);
    check(email, String);
    check(password, String);
    check(roles, Array);

    if (! Houston._user_is_admin(this.userId)) {
      throw new Meteor.Error('You need to be an admin to create users!');
    }

    const userId = Accounts.createUser({ username, email, password });

    Roles.addUsersToRoles(userId, roles);

    return userId;
  }
});

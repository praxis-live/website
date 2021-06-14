---
layout: post
title:  "ClassLoader trees"
author: Neil C Smith
main_image_path: "/assets/classloader-tree.jpg"
description: Exploring ClassLoader trees in the forest of actors
---

_...exploring ClassLoader trees in the [forest of actors](/blog/a-forest-of-actors/)..._


PraxisCORE v5.2 added the ability to share code and types across components (actors)
in a graph. This is a feature that's been requested for a while, but took some
thinking to work out how to implement. And it's a key ingredient in how
[Codelerity](https://www.codelerity.com) is supporting general purpose programming
usage of the PraxisLIVE suite of tools.

It's been possible to add compiled libraries to PraxisCORE projects for a while,
even at runtime, and v5.1 added the ability to
[include dependencies from Maven Central](https://docs.praxislive.org/coding-libraries/).
However, such pre-compiled code is not editable. With the shared code feature
we want to allow components to share features and types, while still allowing that
code to be rewritable safely at runtime like the code of individual components.

## Sharing code

<a href="/assets/shared-code.png" data-lightbox="shared-code"><img alt="Shared code in the graph" src="/assets/shared-code-sm.png" /></a>

Here we have a simple example of shared code usage in PraxisLIVE v5.2 (click to
enlarge). We have a shared `ID` type passed between two components, `id-source` and
`id-consumer` using data ports. This is somewhat contrived as data ports are usually
used for packets of continuous data. We also have a shared `Utils` class for utility
methods that can be static imported into our component code.

The problem to be solved was allowing the shared code to be edited and recompiled
at any point, while ensuring that at any instant, all components in the graph are
linked to the same shared type. We also want to ensure that any changes to shared
code are always valid - not removing types or methods in use by any component.

Part of addressing these concerns is the limitation that shared code is only shared
across the components within a single graph / root. As within our forest of actors
architecture each root is guaranteed to be only active on a single thread at any
time, we can ensure atomic replacement. It also shields us from having to deal with
the problem of some roots being local and others remote. Shared code is currently
stored as a property of the root component, although in theory we could also support
shared code on sub-containers.

Implementing shared code involved some rethinking of the ClassLoader hierarchy used
for dynamic code in components, as well as significant changes to the compiler service
and other services used in the updating of component code.

## A ClassLoader tree

In versions of PraxisCORE prior to v5.2, we have the following (truncated) hierarchy
of ClassLoaders for each component.

- System ClassLoader(s)
- Library ClassLoader
- Code delegate ClassLoaders

The system ClassLoaders are obviously the JDK and modules that make up the PraxisCORE
runtime, on modulepath or classpath. The library ClassLoader is used for adding
pre-compiled libraries to a project, or strictly to the RootHub - this is currently
a subclass of `URLClassLoader` that allows for dynamic addition (not removal), and
there is a single instance that exists for the lifetime of each hub.

Finally, the code delegate ClassLoaders are lightweight in-memory ClassLoaders that
contain a single iteration of one component's code. Every code update involves replacing
this ClassLoader and the classes it contains. There can be many active code delegate
ClassLoaders at any one time - one for every component in the graph that has customized
code.

For more on the use of code delegates to support real-time programming / code hotswap
see the related post on [Just-in-Time Programming](/blog/just-in-time-programming)
systems in Java.

From v5.2 this ClassLoader tree has changed - we now have a shared code
ClassLoader inserted in the hierarchy.

- System ClassLoader(s)
- Library ClassLoader
- _Shared code ClassLoader_
- Code delegate ClassLoaders

That is, _some_ component ClassLoaders may now have the shared code ClassLoader as a
parent. As mentioned, shared code is currently attached to each root, so we now
have a ClassLoader tree that roughly follows our forest of actors hierarchy -
system (process) → library (root hub) → shared code (root) → code delegate (component).

Like the code delegate ClassLoaders, the shared code ClassLoader is lightweight and
in-memory (in fact the same type, wrapping a PMap of PByte). Whenever any shared
code type is updated, we have to recompile all the shared code types, and create
a new ClassLoader. This also means that we need to recompile and create new
ClassLoaders for every dependent code delegate - we cannot just reload the delegate
bytecode in a new ClassLoader or we run the risk of `NoSuchMethodError` and other
problems when the shared code changes incompatibly.

Because of the overhead of recompilation and atomic replacement, the shared code
ClassLoader is kept as an optional element of the hierarchy - only components that
require linking to shared code types have this ClassLoader as a parent. Likewise,
because the code delegate ClassLoader remains separate and has the shared code
ClassLoader as a parent, we can update component code without needing to recompile
and reload any shared code. So, the shared code addition has minimal impact on
runtime code updates that were possible prior to v5.2.

## Compiler and context service rewrites

PraxisCORE has the concept of Protocols, akin to interfaces exposed by actors, and
Services that are Protocol implementations that can be registered and located by
other actors. There are two services involved in runtime code updates - a service
that can create new CodeContexts (wrappers for CodeDelegate instances loaded from
the above mentioned ClassLoaders) and a service that exposes the Java compiler. Both
work with source and bytecode in memory rather than on disk.

The context service deals with actual Java references so must be in the same process
(so one will exist in each PraxisCORE process across a distributed hub). The compiler
service can run in a separate process, or even on a separate machine, so there will
usually only be one.

Prior to v5.2, the compiler service accepted a single Java class body (ie. no
imports, class definition, etc.) and the class name of a type that could be used
to assist in wrapping the class body into valid Java source for compilation. A
legacy of an earlier iteration of compilation where everything was handled in-process,
this had the limitation of not working for full Java sources, or multiple classes.
For v5.2 the compiler service was extended to accept a map of Java sources to compile.
It can also accept an optional map of pre-existing classes to compile against.

The context service had to be rewritten to handle the wrapping of class bodies itself,
as well as extended to provide a shared code context service that also handles
recompilation and reloading of all dependent component code. This also required
changes to how classes are identified. Assume a component with the following action -

```java
@T(1) void logClass() {
    log(INFO, "Class : " + getClass().getName());
}
```

In versions prior to v5.2, if you trigger that action you will see -

```
INFO : /data/custom
Class : $
```

From v5.2 you will see something like -

```
INFO : /data/custom
Class : CODEa255.data.custom.code.$
```

Every component with custom code prior to v5.2 was backed by a delegate class named
`$` in the default package. This was fine, because a class is actually identified
by both its name and the ClassLoader that loaded it. However, now we want to support
compiling multiple components' code at the same time, along with our shared code,
we have a problem. Instead, we switch to a package name based on the component address,
with a partially randomized root package (`a255` here is random hex).

Going back to the basic patch shown in our image above, whenever the `.code` property
on `id-source` or `id-consumer` receives a new iteration of code, that code will be
sent to the code context service actor. That actor will wrap the code in its context,
adding default imports, package location (eg. `package CODExxxx.data.id_source.code;`),
and class definition (eg. `class $ extends CoreCodeDelegate`). This source will
then be passed to the compiler service, along with the previously compiled bytecode
for the `SHARED` package. On successful response, the compiled code delegate is
created, wrapped, and passed back to the component.

On the other hand, when the code of either `ID` or `Utils` is updated, the
`.shared-code` property will collect all shared code dependent components (in this
case both `id-source` and `id-consumer`) and pass their source along in a task for the
code context service. The service will wrap all component code as before, and add
to a source code map along with all shared code, for passing to the compiler. On
successful receipt, the returned bytecode map is partitioned to create the shared
code parent ClassLoader and each individual delegate ClassLoader. Delegates are
created, wrapped, and passed back in one message for atomic replacement. As the
process is asynchronous, the response is validated against the current graph before
each component is updated.

Whether or not a component is compiled and loaded against code from the `SHARED`
package is currently triggered by a search for the String `"SHARED."` in the source
code. This obviously has the possibility for false positives - it might change in
future!

## A note on Data

Data ports allow for continuous data packets to be passed from one component to
another. They are typed by their generic signature, and if that changes then the
configuration is invalidated and all connections are removed. Because class identity
is actually a product of name and ClassLoader, this would have caused all `ID` ports
to be disconnected on every shared code change. In v5.2 data ports have been updated
to retain connections where the type is in the `SHARED` package and has the same
name - atomic code replacement ensures that an `ID.class` reference is always
identical across all components at any one time.

## Inside the PraxisLIVE IDE

The PraxisLIVE IDE has been updated to support shared code editing - right-click
on the graph editor to show / add shared types. PraxisLIVE uses Apache NetBeans'
memory file system to allow editing of shared types in the same way as used for
component code. The shared code memory file system is separate to the ones used
for components, but added in to the IDE's class path support in a similar
hierarchy as used in PraxisCORE for class loading. One difference is that shared
code is always included in the class path, so that completion and code navigation
works, whether the code currently references shared code or not. Imports will be
correctly added on code completion if required, and CTRL-click on shared types or
their members will open them in the editor.

## Next steps

As you might gather from the length of this post, finding the right way to
implement shared code was complicated and took time to get right.
However, it really opens some interesting options for the future as we expand
general purpose coding support in PraxisCORE.

One initial thing currently being looked at is using shared code to support component
prototypes - effectively a way for multiple components to share the same code, but
keeping some ability to override at a component level.

Keep an eye on the
[docs for shared code](https://docs.praxislive.org/coding-shared/) as these
features evolve.

If you're interested in the actual implementations of the processes outlined above,
check out
[CodeProperty](https://github.com/praxis-live/praxiscore/blob/master/praxiscore-code/src/main/java/org/praxislive/code/CodeProperty.java),
[SharedCodeContext](https://github.com/praxis-live/praxiscore/blob/master/praxiscore-code/src/main/java/org/praxislive/code/SharedCodeContext.java),
[SharedCodeProperty](https://github.com/praxis-live/praxiscore/blob/master/praxiscore-code/src/main/java/org/praxislive/code/SharedCodeProperty.java),
[DefaultCodeFactoryService](https://github.com/praxis-live/praxiscore/blob/master/praxiscore-code-services/src/main/java/org/praxislive/code/services/DefaultCodeFactoryService.java),
and
[DefaultCompilerService](https://github.com/praxis-live/praxiscore/blob/master/praxiscore-code-services/src/main/java/org/praxislive/code/services/DefaultCompilerService.java).

Thanks for reading!

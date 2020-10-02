---
layout: post
title:  "PraxisCORE / PraxisLIVE v5"
author: Neil C Smith
main_image_path: "/assets/pl5vector.jpg"
description: PraxisLIVE and PraxisCORE version 5 released
---

PraxisLIVE and PraxisCORE v5.0 were finally released on September 21st, after a
number of earlier beta releases. This was a few months later than originally
scheduled, but then 2020 really hasn't been a great year for best laid plans!

## Radical changes

Version 5 is the most radical change to PraxisLIVE since the move to full
re-codeability between v1 and v2. The extra months afforded by the 2020 lockdown
and postponement of some work have been used to fully implement and extend the
changes discussed in the [2020 Vision](/blog/2020-vision/) post.

There has been a major rewrite of both the core runtime and the IDE. Much legacy
and deprecated functionality has been removed. All of PraxisCORE has now been
rewritten around the new base actor system introduced in part in 4.4.0.
PraxisCORE is now built on top of the Java module system, rather than the 
NetBeans platform (the PraxisLIVE IDE is still based on
[Apache NetBeans](https://netbeans.apache.org/)). The build for PraxisCORE has
been moved to Maven, and individual modules are deployed to central for re-use
from other projects.

Both PraxisLIVE and PraxisCORE now require at least Java 11, and fully embrace
newer Java features. An open-source Java 11 JDK from
[AdoptOpenJDK](https://adoptopenjdk.net/) is now included in all binary bundles,
including in the new AppImage for Linux, although the standalone zip is still
available.

PraxisLIVE now supports running multiple projects at once. Distributed hub
support has moved from the IDE into PraxisCORE, and is configured separately for
each project - the default configuration will run audio and video roots
in separate Java processes. Additional processes are now started when required
rather than automatically. The master/slave terminology has been removed, both
because it's problematic and because it no longer fully reflects the technical
roles different processes can play.
[Read more about configuring project hubs](https://docs.praxislive.org/projects/#hub-configuration)
in the docs.

The PraxisCORE runtime is now included in the `praxiscore` folder inside the
IDE installation. It can be copied out and run from the CLI for networking or
project running, or embedded inside a project to make it standalone.

Video / OpenGL visualization is now based on
[libp5x](https://github.com/praxis-live/libp5x/), our modularized fork of
Processing that uses [LWJGL](https://www.lwjgl.org/) for rendering. Audio
support has now moved to our [Pipes v2](https://github.com/jaudiolibs/pipes)
library, which includes all the unit generators previously in PraxisLIVE itself.
Both of these libraries are published separately via Maven for use elsewhere.

## Rethinking coding

One thing you might notice on the website and elsewhere is a new tagline for the
overall project - _rethinking general purpose and creative coding_. PraxisLIVE
will always aim to be a great programming system for creative coding, but one
key aspect of founding [Codelerity](https://www.codelerity.com/) to support
PraxisLIVE's development is to explore opportunities for use outside of this
sector.

PraxisCORE's move to Java modules and the publishing of individual modules is a
part of this. Version 5 also lays the groundwork for a range of additional
features to come over the next months that will benefit everyone. These include
proper dependency management for improving third-party library usage (such as Maven
dependencies), support for shared (and still editable) code across components,
better support for working with embedded boards and electronics (and Raspberry
Pi), and improving CLI and code editing support away from the IDE.

By version 6 it may be that all specific features (audio, video, etc.) get
automatically downloaded only when required. But throughout version 5 expect
additions that concentrate on what PraxisCORE and PraxisLIVE do best -
rethinking the coding process, and bringing the best aspects of Erlang,
Smalltalk and Extempore into the Java world.

Get it while it's hot - [download PraxisLIVE v5](/download/) now!
---
layout: post
title:  "PraxisCORE / PraxisLIVE v6"
author: Neil C Smith
main_image_path: "/assets/PraxisLIVEv600.jpg"
description: PraxisLIVE and PraxisCORE version 6 released
---

I'm pleased to announce that this month saw the first version 6 release of PraxisCORE
and PraxisLIVE. Somewhat longer in gestation than originally planned (due to things
unrelated to the project), version 6 is a substantial rewrite of some key aspects of how
PraxisCORE works. Expect some rough edges! These will improve as version 6 update
releases happen over the coming months.

## Key changes

Many deprecated and legacy features have been removed, removing things that were 
hindering development of some key new features. With existing projects, make
sure to check for and correct use of deprecated features and code in the latest
version 5 release before attempting to open a project in version 6. Also check the
following section about removed root types.

The IDE and core now require minimum Java 21. Installers with bundled JDK will now
ship with the latest JDK version as standard. Networked hubs now use [Netty](https://netty.io/)
and [Ion](https://github.com/amazon-ion) to provide a more robust and structured
communication protocol than was possible with the previous OSC implementation. Much
of the project saving and execution has moved directly into PraxisCORE, which means
that much more of the IDE functionality works by calling Pcl commands. This also opens up
the possibility of alternative editors, or even one day the IDE will be a PraxisCORE
project!

Other libraries have been updated, including our [libP5X](https://github.com/praxis-live/libp5x)
updated to [Processing 4](https://processing.org/). Runtime dependency management
is now based on [MiMa](https://github.com/maveniverse/mima) rather than Ivy.

There are a bunch of other useful changes. Custom roots can now specify use of table
editing rather than the graph editor (we can now make fully recodeable MIDI editors, etc.)
Containers can filter allowed child types and even specify custom types. The weight
parameter on annotations is now optional - eg. `@P int x,y,z;` is now legal syntax! The
ordering is in alphabetical order by default. Examples and custom components are being
updated and added showing the new features.

The most obvious visual change is the new vector logo, window background actions, and
revamped dashboard. The background actions and dashboard support were contributed to
Apache NetBeans a few months ago, but were really written for PraxisLIVE!

Finally, the IDE build system has been moved to Maven to match PraxisCORE. Most of the
IDE modules are now published to the central repository as well, allowing use of PraxisCORE
and PraxisLIVE as a platform for other projects. One of which is currently in the works.

## Root templates .. or where's my OSC, MIDI, TinkerForge support?

Version 6 sees the removal of the built-in support for OSC, MIDI and TinkerForge roots.
These features will be supported by using custom root templates and (where necessary)
external libraries in future. A MIDI root template is already included in the custom
components repository. OSC and TinkerForge examples will be added soon. Automatic
migration from old root types is not currently available.

To use the MIDI template, make sure to install custom components from the dashboard
display. Then use the popup menu on the project, select `New / Other...`, and find
the MIDI template in the Roots category.

If you have any audio, video or other root graph that you want to use in other projects,
you can also use the `Save as Template...` action on any `.pxr` file.

The [custom MIDI component](https://github.com/praxis-live/components/blob/master/Roots/MIDI.pxr)
also offers a good demonstration of the new annotations for registering table editing
and custom components - in particular here, where `ControllerComponent` is a subclass of
`CoreCodeDelegate` in the shared code -

```java
@SupportedTypes(system = false,
        custom = {
            @CustomType(type = "midi:controller", base = ControllerComponent.class)
        }
)
@DisplayTable(properties = {"channel", "controller", "binding"})
public void init() { ...
```

## Towards introspection and moldability

Over the next few months I'll be working on various improvements within PraxisCORE and
PraxisLIVE related to introspection, and improved visualization and control over what
is happening in the underlying system. This in part comes from an interest in exploring
how aspects of [moldable development](https://moldabledevelopment.com/) and
[live moldable notebooks](https://clerk.vision/) can work within the
cyber-physical coding context of PraxisLIVE. Watch this space ...

In the meantime, [download PraxisLIVE v6](/download/) and get discovering!

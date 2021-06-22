# AbstractQueuedSynchronizer

提供了一个基于 FIFO 队列，可以用于构建锁或者其他相关同步装置的基础框架。该同步器（以下简称同步器）利用了一个 int 来表示状态，
期望它能够成为实现大部分同步需求的基础。使用的方法是继承，子类通过继承同步器并需要实现它的方法来管理其状态，
管理的方式就是通过类似 acquire 和 release 的方式来操纵状态

```java
    public abstract class AbstractQueuedSynchronizer
    extends AbstractOwnableSynchronizer
    implements java.io.Serializable {

    }
```

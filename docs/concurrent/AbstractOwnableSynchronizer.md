# AbstractOwnableSynchronizer

主要提供独占式模式下获取临界区访问权限的线程的设置与获取功能并且获取设置方法没有使用任何同步或者 volatile 关键字的限制

```java

    public abstract class AbstractOwnableSynchronizer
    implements java.io.Serializable {

        /** Use serial ID even though all fields transient. */
        // 序列化相关字段
        private static final long serialVersionUID = 3737899427754241961L;

        /**
         * Empty constructor for use by subclasses.
         */
        protected AbstractOwnableSynchronizer() { }

        /**
         * The current owner of exclusive mode synchronization.
         */
        private transient Thread exclusiveOwnerThread;

        /**
         * Sets the thread that currently owns exclusive access.
         * A {@code null} argument indicates that no thread owns access.
         * This method does not otherwise impose any synchronization or
         * {@code volatile} field accesses.
         * @param thread the owner thread
         */
        // 独占模式下，获取状态的线程
        protected final void setExclusiveOwnerThread(Thread thread) {
            exclusiveOwnerThread = thread;
        }

        /**
         * Returns the thread last set by {@code setExclusiveOwnerThread},
         * or {@code null} if never set.  This method does not otherwise
         * impose any synchronization or {@code volatile} field accesses.
         * @return the owner thread
         */
         // 返回获取独占锁的线程
        protected final Thread getExclusiveOwnerThread() {
            return exclusiveOwnerThread;
        }
    }
```

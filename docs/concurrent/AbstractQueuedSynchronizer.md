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

## 内部类

同步器的开始提到了其实现依赖于一个 FIFO 队列，那么队列中的元素 Node 就是保存着线程引用和线程状态的容器，
每个线程对同步器的访问，都可以看做是队列中的一个节点。

### Node

```java

    static final class Node {
        /** Marker to indicate a node is waiting in shared mode */
        /** 标志着等待的Node实例处于共享模式 */
        static final Node SHARED = new Node();
        /** Marker to indicate a node is waiting in exclusive mode */
        /** 标志着等待的Node实例处于独占模式 */
        static final Node EXCLUSIVE = null;

        /** waitStatus value to indicate thread has cancelled */
        /** 等待节点的对应的线程被取消了 */
        static final int CANCELLED =  1;
        /** waitStatus value to indicate successor's thread needs unparking */
        /** 等待节点的后继节点对应的线程需要阻塞 */
        static final int SIGNAL    = -1;
        /** waitStatus value to indicate thread is waiting on condition */
        /** 等待节点对应的线程在条件队列等待中 */
        static final int CONDITION = -2;
        /**
         * waitStatus value to indicate the next acquireShared should
         * unconditionally propagate
         */
        static final int PROPAGATE = -3;

        /**
         * Status field, taking on only the values:
         *   SIGNAL:     The successor of this node is (or will soon be)
         *               blocked (via park), so the current node must
         *               unpark its successor when it releases or
         *               cancels. To avoid races, acquire methods must
         *               first indicate they need a signal,
         *               then retry the atomic acquire, and then,
         *               on failure, block.
         *   CANCELLED:  This node is cancelled due to timeout or interrupt.
         *               Nodes never leave this state. In particular,
         *               a thread with cancelled node never again blocks.
         *   CONDITION:  This node is currently on a condition queue.
         *               It will not be used as a sync queue node
         *               until transferred, at which time the status
         *               will be set to 0. (Use of this value here has
         *               nothing to do with the other uses of the
         *               field, but simplifies mechanics.)
         *   PROPAGATE:  A releaseShared should be propagated to other
         *               nodes. This is set (for head node only) in
         *               doReleaseShared to ensure propagation
         *               continues, even if other operations have
         *               since intervened.
         *   0:          None of the above
         *
         * The values are arranged numerically to simplify use.
         * Non-negative values mean that a node doesn't need to
         * signal. So, most code doesn't need to check for particular
         * values, just for sign.
         *
         * The field is initialized to 0 for normal sync nodes, and
         * CONDITION for condition nodes.  It is modified using CAS
         * (or when possible, unconditional volatile writes).
         */
        /**
         * 1.CANCELLED，值为1，表示当前的线程被取消；
         * 2.SIGNAL，值为-1，表示当前节点的后继节点包含的线程需要运行，也就是unpark；
         * 3.CONDITION，值为-2，表示当前节点在等待condition，也就是在condition队列中；
         * 4.PROPAGATE，值为-3，表示当前场景下后续的acquireShared能够得以执行；
         * 5.值为0，表示当前节点在sync队列中，等待着获取锁。
         */
        volatile int waitStatus;

        /**
         * Link to predecessor node that current node/thread relies on
         * for checking waitStatus. Assigned during enqueuing, and nulled
         * out (for sake of GC) only upon dequeuing.  Also, upon
         * cancellation of a predecessor, we short-circuit while
         * finding a non-cancelled one, which will always exist
         * because the head node is never cancelled: A node becomes
         * head only as a result of successful acquire. A
         * cancelled thread never succeeds in acquiring, and a thread only
         * cancels itself, not any other node.
         */
        // 前驱节点
        volatile Node prev;

        /**
         * Link to the successor node that the current node/thread
         * unparks upon release. Assigned during enqueuing, adjusted
         * when bypassing cancelled predecessors, and nulled out (for
         * sake of GC) when dequeued.  The enq operation does not
         * assign next field of a predecessor until after attachment,
         * so seeing a null next field does not necessarily mean that
         * node is at end of queue. However, if a next field appears
         * to be null, we can scan prev's from the tail to
         * double-check.  The next field of cancelled nodes is set to
         * point to the node itself instead of null, to make life
         * easier for isOnSyncQueue.
         */
        // 后继节点
        volatile Node next;

        /**
         * The thread that enqueued this node.  Initialized on
         * construction and nulled out after use.
         */
        // 存储的线程引用
        volatile Thread thread;

        /**
         * Link to next node waiting on condition, or the special
         * value SHARED.  Because condition queues are accessed only
         * when holding in exclusive mode, we just need a simple
         * linked queue to hold nodes while they are waiting on
         * conditions. They are then transferred to the queue to
         * re-acquire. And because conditions can only be exclusive,
         * we save a field by using special value to indicate shared
         * mode.
         */
        // 当前节点在Condition中等待队列上的下一个节点（给Condition等待队列使用）
        Node nextWaiter;

        /**
         * Returns true if node is waiting in shared mode.
         */
        final boolean isShared() {
            return nextWaiter == SHARED;
        }

        /**
         * Returns previous node, or throws NullPointerException if null.
         * Use when predecessor cannot be null.  The null check could
         * be elided, but is present to help the VM.
         *
         * @return the predecessor of this node
         */
        final Node predecessor() throws NullPointerException {
            Node p = prev;
            if (p == null)
                throw new NullPointerException();
            else
                return p;
        }

        Node() {    // Used to establish initial head or SHARED marker
        }

        Node(Thread thread, Node mode) {     // Used by addWaiter
            this.nextWaiter = mode;
            this.thread = thread;
        }

        Node(Thread thread, int waitStatus) { // Used by Condition
            this.waitStatus = waitStatus;
            this.thread = thread;
        }
    }

```

## 属性

```java
    /**
     * Head of the wait queue, lazily initialized.  Except for
     * initialization, it is modified only via method setHead.  Note:
     * If head exists, its waitStatus is guaranteed not to be
     * CANCELLED.
     */
    /** Node等待队列头部节点，被volatile语义修饰 */
    private transient volatile Node head;

    /**
     * Tail of the wait queue, lazily initialized.  Modified only via
     * method enq to add new wait node.
     */
    /** Node等待队列尾部节点，被volatile语义修饰 */
    private transient volatile Node tail;

    /**
     * The synchronization state.
     */
    /** 同步状态（上锁，释放即都是对state的修改） */
    private volatile int state;

```

## 方法

获取独占锁的入口途径之一

### acquire

```java

    /**
     * Acquires in exclusive mode, ignoring interrupts.  Implemented
     * by invoking at least once {@link #tryAcquire},
     * returning on success.  Otherwise the thread is queued, possibly
     * repeatedly blocking and unblocking, invoking {@link
     * #tryAcquire} until success.  This method can be used
     * to implement method {@link Lock#lock}.
     *
     * @param arg the acquire argument.  This value is conveyed to
     *        {@link #tryAcquire} but is otherwise uninterpreted and
     *        can represent anything you like.
     */
    @ReservedStackAccess
    public final void acquire(int arg) {
        /**
         * 1.tryAcquire尝试获取锁。此方法由子类提供具体实现逻辑
         *
         */
        if (!tryAcquire(arg) &&
            acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
            selfInterrupt();
    }

```

### hasQueuedPredecessors

判断同步队列是否有其他线程正在排队，此方法在公平锁的实现中所用到

```java

    public final boolean hasQueuedPredecessors() {
        // The correctness of this depends on head being initialized
        // before tail and on head.next being accurate if the current
        // thread is first in queue.
        // 获取尾节点
        Node t = tail; // Read fields in reverse initialization order
        // 获取头节点
        Node h = head;
        Node s;
        /**
         * 1. 如果 h==t 说明当前线程前面没有节点 直接返回false
         * 2. h!=t 代表了队列必有2个以上的元素，可能是 一个new Node(),和
         * 3. 如果而(s= h.next)==null为true，有其他线程第一次正在入队时，可能会出现。见AQS的enq方法，compareAndSetHead(node)完成，
         *    还没执行tail=head语句时，此时tail=null,head=newNode,head.next=null。这种情况肯定是有线程进入了队列等待所以返回true
         * 4. (s = h.next) == null为false，head节点可能占用着锁（除了第一次执行enq()入队列时，head仅仅是个new Node()，没有实际对应任何线程，
         *    但是却“隐式”对应第一个获得锁但并未入队列的线程，和后续的head在含义上保持一致），也可能释放了锁（unlock()）,未被阻塞的head.next节点对应的线程在任意时刻都是有必要去尝试获取锁
         */
        return h != t &&
            ((s = h.next) == null || s.thread != Thread.currentThread());
    }
```

### addWaiter

```java

```

### acquireQueued

```java

```

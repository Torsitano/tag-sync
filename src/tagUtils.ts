import { CreateTagsCommand, EC2Client, Tag } from '@aws-sdk/client-ec2'

export interface ApplyTagsOptions {
    ec2Client: EC2Client
    resourceIds: string[]
    tags: Tag[]
    isDryRun: boolean
    resourceType: string
    resourceName?: string
}

export async function applyTagsToResources( options: ApplyTagsOptions ): Promise<void> {
    const { ec2Client, resourceIds, tags, isDryRun, resourceType, resourceName } = options

    if ( tags.length === 0 ) {
        console.log( `No tags to apply to ${resourceType}${resourceName ? ` '${resourceName}'` : ''}` )
        return
    }

    const resourceDescription = resourceName ? `${resourceType} '${resourceName}'` : `${resourceType}(s)`
    console.log( `Applying tags to ${resourceDescription}` )

    if ( isDryRun ) {
        console.log( `DRY RUN: Would apply tags to ${resourceDescription}:` )
        console.dir( tags )
        return
    }

    const command = new CreateTagsCommand( {
        Resources: resourceIds,
        Tags: tags,
    } )

    await ec2Client.send( command )
    console.log( `Tags applied to ${resourceDescription}` )
} 